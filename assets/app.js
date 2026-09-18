/* 渲染與互動邏輯。內容都在 data.js，一般不需要改這一檔。 */

const PUB = () => RECIPES.filter(r => r.狀態 === "已發布");
const POSTS_PUB = () => (typeof POSTS !== "undefined" ? POSTS : []).filter(p => p.狀態 === "已發布");
const img = r => mediaURL(r.封面圖) || r.similar_圖 || "";
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
const byDate = (a, b) => String(b.發布日期 || "").localeCompare(String(a.發布日期 || ""));
const PER_PAGE = 12;

/* 每道菜的標籤 = 情境 + 工具（自動產生，dashboard 分類改了這裡就跟著變）*/
const tagsOf = r => [...new Set([...(r.情境 || []), ...(r.料理工具 || [])])];

/* ---------- 媒體來源 ----------
   資料裡寫 "media/xxx.mp4" 這種相對路徑；SITE.媒體base 若有填（例如搬到
   Cloudflare R2 之後的 "https://cdn.xxx.com/"），就自動接在前面。
   → 將來整批搬家只要改 data.js 那一行，全站影片和圖片一起換位置。 */
function mediaURL(p){
  const s = String(p || "").trim();
  if (!s) return "";
  if (/^(https?:)?\/\//.test(s) || s.startsWith("data:")) return s;   // 已是完整網址
  const base = (typeof SITE !== "undefined" && SITE.媒體base) ? String(SITE.媒體base) : "";
  if (!base) return s;
  return base.replace(/\/+$/, "") + "/" + s.replace(/^\/+/, "");
}

/* 小技巧：用全形空白或換行分句，每句獨立一行 */
/* 一支影片有多份食譜時：食材用 { 分組: "名稱" }，步驟／小技巧用 "## 名稱" 開頭的一行當小標題 */
const isHead = x => typeof x === "string" && x.startsWith("## ");
const headText = x => x.slice(3).trim();
const stepsHTML = steps => { let n = 0; return (steps || []).map(x => isHead(x)
  ? `<div class="grp">${esc(headText(x))}</div>`
  : `<div class="stp"><span class="sn">${++n}</span><span>${esc(x)}</span></div>`).join(""); };
const stepsText = steps => { let n = 0; return (steps || []).map(x => isHead(x) ? `\n【${headText(x)}】` : `${++n}. ${x}`).join("\n"); };
const tipsHTML = t => tipLines(t).map(x => isHead(x) ? `<div class="grp">${esc(headText(x))}</div>` : `<p>${esc(x)}</p>`).join("");
const tipsText = t => tipLines(t).map(x => isHead(x) ? `\n【${headText(x)}】` : "・" + x).join("\n");
const tipLines = t => String(t || "").split(/　|\n/).map(x => x.trim()).filter(Boolean);

/* ---------- 影片：YouTube 連結或 mp4 都吃 ---------- */
function ytId(u){
  const m = String(u).match(/(?:shorts\/|watch\?v=|youtu\.be\/|embed\/)([A-Za-z0-9_-]{6,})/);
  if (m) return m[1];
  return /^[A-Za-z0-9_-]{8,}$/.test(u) && !u.includes("/") && !u.includes(".") ? u : null;
}
function videoHTML(r){
  const u = (r.影片網址 || "").trim();
  if (!u) return `<div class="ph-video">影片位置<br>（填 YouTube 連結或 mp4 路徑）</div>`;
  const id = ytId(u);
  if (id) {
    /* enablejsapi=1 讓我們能攔截「播放結束」，避免跑出推薦影片格（見 stopYTEndScreen）*/
    return `<iframe class="yt" id="yt-player" src="https://www.youtube-nocookie.com/embed/${id}?rel=0&modestbranding=1&playsinline=1&enablejsapi=1&origin=${encodeURIComponent(location.origin)}" title="${esc(r.料理名稱)}" allow="accelerometer; encrypted-media; picture-in-picture" allowfullscreen loading="lazy"></iframe>`;
  }
  /* 影片有講話 → 保留音軌與控制列，不自動播放 */
  return `<video class="rd-video" src="${mediaURL(u)}" ${r.封面圖 ? `poster="${mediaURL(r.封面圖)}"` : ""} controls playsinline preload="metadata"></video>`;
}

/* YouTube 播完會跳出同頻道的推薦影片格（rel=0 只能限縮成自己頻道，關不掉）。
   這裡攔截「播放結束」事件，立刻回到第一格並暫停，推薦畫面就來不及出現。 */
function stopYTEndScreen(){
  if (!document.getElementById("yt-player")) return;
  const init = () => {
    new YT.Player("yt-player", {
      events: {
        onStateChange: e => {
          if (e.data === YT.PlayerState.ENDED) { e.target.seekTo(0); e.target.pauseVideo(); }
        }
      }
    });
  };
  if (window.YT && window.YT.Player) { init(); return; }
  window.onYouTubeIframeAPIReady = init;
  if (!document.getElementById("yt-api")) {
    const s = document.createElement("script");
    s.id = "yt-api"; s.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(s);
  }
}


/* ================================================================
   份量換算與倍數
   ⚠️ 只做「保證正確」的換算：體積↔體積、重量↔重量。
   ml 和 g 不能互換（1大匙油13g、糖12g、鹽18g、麵粉8g，只有水是1:1），
   要做 ml→g 必須為每個食材建密度表，目前不做。
   ================================================================ */
const 體積單位 = { "大匙":15, "湯匙":15, "小匙":5, "茶匙":5, "cc":1, "ml":1, "毫升":1, "公升":1000, "L":1000 };
const 重量單位 = { "g":1, "公克":1, "克":1, "kg":1000, "公斤":1000 };
const 杯ml = () => (SITE.換算 && SITE.換算.杯) ? SITE.換算.杯 : 240;

/* 小數轉回好讀的分數：0.5→1/2、1.25→1又1/4 */
function 數字格式(n){
  if (!isFinite(n)) return String(n);
  if (Math.abs(n - Math.round(n)) < 1e-6) return String(Math.round(n));
  const 分數 = [[1/4,"1/4"],[1/3,"1/3"],[1/2,"1/2"],[2/3,"2/3"],[3/4,"3/4"]];
  const 整 = Math.floor(n), 餘 = n - 整;
  for (const [v, s] of 分數) if (Math.abs(餘 - v) < 0.02) return 整 ? `${整}又${s}` : s;
  return String(Math.round(n * 10) / 10);
}
function 讀數字(s){
  if (s.includes("又")) { const [a,b] = s.split("又"); const [x,y] = b.split("/"); return +a + (+x)/(+y); }
  if (s.includes("/"))  { const [x,y] = s.split("/"); return (+x)/(+y); }
  return +s;
}
/* 把一段份量文字（"2大匙"、"1/4顆"、"5根（約600g）"）套用倍數與單位模式 */
function 換算份量(text, 倍數, 公制){
  const 單位群 = "大匙|湯匙|小匙|茶匙|杯|cc|ml|毫升|公升|L|kg|公斤|g|公克|克";
  return String(text ?? "").replace(
    new RegExp(`(\\d+又\\d+\\/\\d+|\\d+\\/\\d+|\\d+(?:\\.\\d+)?)\\s*(${單位群})?`, "g"),
    (全, 數, 單位) => {
      let n = 讀數字(數) * 倍數;
      if (!單位) return 數字格式(n);
      if (公制) {
        const ml = 單位 === "杯" ? 杯ml() : 體積單位[單位];
        if (ml) { const 總 = n * ml; return 總 >= 1000 ? 數字格式(總/1000) + "L" : 數字格式(總) + "ml"; }
        const g = 重量單位[單位];
        if (g) { const 總 = n * g; return 總 >= 1000 ? 數字格式(總/1000) + "kg" : 數字格式(總) + "g"; }
      }
      return 數字格式(n) + 單位;
    }
  );
}

/* 材料區的倍數／單位控制列 */
let QTY = { 倍數: 1, 公制: false };
function 畫材料(r){
  const el = document.getElementById("ingList");
  if (el) el.innerHTML = (r.食材 || []).map(i => i.分組 ? `<div class="grp">${esc(i.分組)}</div>` :
    `<div class="ing-row"><b>${esc(i.名稱)}</b><span>${esc(換算份量(i.份量, QTY.倍數, QTY.公制))}</span></div>`).join("");
  const sv = document.getElementById("servings");
  if (sv) sv.textContent = 換算份量(r.份量, QTY.倍數, false);
}
function bindQty(r){
  const bar = document.getElementById("qtybar");
  if (!bar) return;
  bar.querySelectorAll("[data-s]").forEach(b => b.onclick = () => {
    QTY.倍數 = +b.dataset.s;
    bar.querySelectorAll("[data-s]").forEach(x => x.classList.toggle("on", x === b));
    畫材料(r);
  });
  bar.querySelectorAll("[data-u]").forEach(b => b.onclick = () => {
    QTY.公制 = b.dataset.u === "metric";
    bar.querySelectorAll("[data-u]").forEach(x => x.classList.toggle("on", x === b));
    畫材料(r);
  });
  畫材料(r);
}

/* ---------- 分享：手機叫出系統分享面板，電腦退回複製連結 ---------- */
function bindShare(title){
  const b = document.getElementById("sharebtn");
  if (!b) return;
  const label = b.textContent;
  b.onclick = async () => {
    const url = location.href;
    if (navigator.share) {
      try { await navigator.share({ title, url }); return; } catch (e) { if (e && e.name === "AbortError") return; }
    }
    await copyToClipboard(url);
    b.textContent = "已複製連結 ✓"; b.classList.add("done");
    setTimeout(() => { b.textContent = label; b.classList.remove("done"); }, 1800);
  };
}

/* ---------- 共用外框（選單、社群、公告、頁尾）---------- */
const NAV = [
  ["index.html", "食譜"],
  ["blog.html", "文章"],
  ["goods.html", "好物"],
  ["vote.html", "投票"],
  ["tools.html", "計算機"],
  ["about.html", "關於我"]
];

/* 社群圖示：data.js 的「社群」名稱對到這裡；沒有對應圖示就顯示文字 */
const ICONS = {
  IG: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="5.2"/><circle cx="12" cy="12" r="4.1"/><circle cx="17.3" cy="6.7" r="1.1" fill="currentColor" stroke="none"/></svg>`,
  YT: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><rect x="2.2" y="5" width="19.6" height="14" rx="4.4"/><path d="M10.2 9.1v5.8l5-2.9z" fill="currentColor" stroke="none"/></svg>`,
  THREADS: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M16.4 11.4c-2.9-.7-6.5-.6-6.5 1.7 0 1.6 1.6 2.3 2.9 2 1.8-.4 2.4-2.4 2.4-5.2 0-2-1-3.2-3.1-3.2-1.5 0-2.6.6-3.2 1.6"/><path d="M12 21c-5 0-8-3.4-8-9s3-9 8-9 8 3.4 8 9c0 3-1 5.2-2.6 6.6"/></svg>`,
  FB: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="4.6"/><path d="M14.6 8.4h-1.2c-.9 0-1.4.5-1.4 1.4v1.4h2.4l-.4 2.4h-2v5"/><path d="M10 11.2h2"/></svg>`,
  PINTEREST: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M10 20c-.4-1.6.2-3.6.6-5.2l1-4"/><path d="M8.8 13.6c-.5-.8-.7-1.7-.5-2.7.4-2.2 2.5-3.5 4.6-3.1 1.9.3 3.1 1.9 2.8 3.9-.3 2.1-1.7 3.6-3.4 3.3-.9-.2-1.4-.9-1.2-1.8"/></svg>`,
  TIKTOK: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M14.2 4v9.6a3.4 3.4 0 1 1-3.4-3.4"/><path d="M14.2 4c.4 2.1 1.9 3.5 4 3.7"/></svg>`
};
function socialIcon(s){
  const key = String(s.名稱 || "").toUpperCase().replace(/[^A-Z]/g, "");
  return ICONS[key] || `<span style="font-size:12px;letter-spacing:1px;">${esc(s.名稱)}</span>`;
}

function renderChrome(current){
  const socialLinks = (SITE.社群 || []).map(s =>
    `<a href="${s.連結}" target="_blank" rel="noopener" aria-label="${esc(s.名稱)}" title="${esc(s.名稱)}">${socialIcon(s)}</a>`).join("");
  const menuLinks = NAV.map(([h, t]) => `<a href="${h}" class="${h === current ? "on" : ""}">${t}</a>`).join("");

  const hd = document.getElementById("header");
  if (hd) hd.innerHTML = `<div class="wrap">
      <div class="nav">
        <a class="logo" href="index.html">${esc(SITE.名稱)}</a>
        <nav class="menu">${menuLinks}<div class="social">${socialLinks}</div></nav>
        <div class="desk-social">${socialLinks}</div>
        <div class="burger" id="burger" role="button" aria-label="選單"><span></span><span></span><span></span></div>
      </div>
    </div>`;
  /* 選單開關：漢堡切換、點選單項目、按 Esc、切回電腦版都會關閉 */
  const closeMenu = () => document.body.classList.remove("nav-open");
  const b = document.getElementById("burger");
  if (b) b.onclick = () => document.body.classList.toggle("nav-open");
  hd.querySelectorAll(".menu a").forEach(a => a.addEventListener("click", closeMenu));
  document.addEventListener("keydown", e => { if (e.key === "Escape") closeMenu(); });
  window.addEventListener("resize", () => { if (window.innerWidth >= 860) closeMenu(); });

  /* 捲動時把站名縮小，讓菜名成為主角 */
  const onScroll = () => document.body.classList.toggle("scrolled", window.scrollY > 40);
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  const an = document.getElementById("announce");
  if (an) {
    const g = SITE.團購;
    if (g && g.顯示) { an.innerHTML = `${esc(g.標籤)}｜${esc(g.標題)} →`; an.style.display = "block"; an.onclick = () => g.連結 && (location.href = g.連結); }
    else an.style.display = "none";
  }

  const ft = document.getElementById("footer");
  if (ft) ft.innerHTML =
    `<div class="fnav">${NAV.map(([h, t]) => `<a href="${h}">${t}</a>`).join("")}</div>
     ${esc(SITE.名稱)} — ${esc(SITE.副標)}<br>${esc(SITE.聯盟聲明)}`;
}

function groupBuyCard(){
  const g = SITE.團購;
  if (!g || !g.顯示) return "";
  return `<a class="gb-card" href="${g.連結}">
    <div class="k">${esc(g.標籤)}</div><h3>${esc(g.標題)}</h3><p>${esc(g.說明)}</p>
    <span class="go">看這次的團 →</span></a>`;
}

function cardHTML(r){
  return `<a class="card" href="recipe.html?id=${r.id}">
    <div class="card-media">
      <img class="ph" src="${img(r)}" alt="${esc(r.料理名稱)}" loading="lazy" onerror="this.style.opacity=.15">
      <span class="m">${r.料理時間}分鐘・${esc((r.料理工具 || []).join("・"))}</span>
    </div>
    <h3>${esc(r.料理名稱)}</h3>
    <div class="ex">${esc(r.介紹 || "")}</div>
  </a>`;
}

/* ---------- 首頁：標籤篩選 + 分頁 ---------- */
let TAG = "", PAGE = 1;

function renderHome(){
  renderChrome("index.html");
  const all = PUB();
  const order = SITE.標籤順序 || [];
  const found = [...new Set(all.flatMap(tagsOf))];
  const tags = [...order.filter(t => found.includes(t)), ...found.filter(t => !order.includes(t))];

  /* 從內頁的標籤連結進來時（index.html?tag=便當）直接套用該標籤 */
  const fromUrl = new URLSearchParams(location.search).get("tag") || "";
  TAG = tags.includes(fromUrl) ? fromUrl : "";

  const tagsEl = document.getElementById("tags");
  if (!tags.length) { tagsEl.style.display = "none"; paint(); return; }
  tagsEl.innerHTML =
    `<div class="tags-in"><button class="tag${TAG ? "" : " on"}" data-t="">全部</button>` +
    tags.map(t => `<button class="tag${t === TAG ? " on" : ""}" data-t="${esc(t)}">${esc(t)}</button>`).join("") + `</div>`;

  document.querySelectorAll("#tags .tag").forEach(el => {
    el.onclick = () => {
      document.querySelectorAll("#tags .tag").forEach(x => x.classList.remove("on"));
      el.classList.add("on"); TAG = el.dataset.t; PAGE = 1; paint();
    };
  });
  paint();
}

function paint(){
  const list = PUB().filter(r => !TAG || tagsOf(r).includes(TAG)).sort(byDate);
  const pages = Math.max(1, Math.ceil(list.length / PER_PAGE));
  if (PAGE > pages) PAGE = pages;
  const slice = list.slice((PAGE - 1) * PER_PAGE, PAGE * PER_PAGE);

  document.getElementById("grid").innerHTML = slice.map(cardHTML).join("")
    || (PUB().length === 0
        ? `<div class="empty"><b>食譜整理中</b>很快就會放上來。<br>先到 <a href="${SITE.IG連結}" target="_blank" rel="noopener" style="color:var(--強調色);border-bottom:1px solid var(--強調色);">${esc(SITE.IG帳號 || "Instagram")}</a> 看影片版</div>`
        : `<div class="empty"><b>這個標籤還沒有食譜</b>換一個標籤看看</div>`);
  document.getElementById("count").textContent =
    list.length ? `共 ${list.length} 道${pages > 1 ? `・第 ${PAGE} / ${pages} 頁` : ""}` : "";

  const pg = document.getElementById("pager");
  if (pages <= 1) { pg.innerHTML = ""; return; }
  let h = `<button class="pg" ${PAGE === 1 ? "disabled" : ""} data-p="${PAGE - 1}">←</button>`;
  for (let i = 1; i <= pages; i++) h += `<button class="pg ${i === PAGE ? "on" : ""}" data-p="${i}">${i}</button>`;
  h += `<button class="pg" ${PAGE === pages ? "disabled" : ""} data-p="${PAGE + 1}">→</button>`;
  pg.innerHTML = h;
  pg.querySelectorAll(".pg").forEach(b => {
    if (b.disabled) return;
    b.onclick = () => { PAGE = +b.dataset.p; paint(); window.scrollTo({ top: 0, behavior: "smooth" }); };
  });
}

/* ---------- 投票 ---------- */
const VOTE_KEY = "fays-table-vote";
function renderVote(elId){
  const el = document.getElementById(elId);
  const v = SITE.投票;
  if (!el) return;
  if (!v || !v.顯示 || !(v.選項 || []).length) {
    /* 投票頁（data-空白訊息）要留一句話，嵌在其他頁面時整塊隱藏 */
    if (el.dataset.空白訊息) el.innerHTML = `<div class="empty"><b>${esc(el.dataset.空白標題 || "")}</b>${esc(el.dataset.空白訊息)}</div>`;
    else el.style.display = "none";
    return;
  }
  const voted = localStorage.getItem(VOTE_KEY);
  el.innerHTML = `<div class="vote${voted ? " voted" : ""}" id="voteBox">
    <div class="k">${voted ? "投票結果" : "來投一票"}</div>
    <h3>${esc(v.標題)}</h3>${v.說明 ? `<div class="sub">${esc(v.說明)}</div>` : ""}
    ${v.選項.map(o => `<div class="vopt" data-id="${o.id}"><div class="bar"></div>
      <div class="lb"><span>${esc(o.名稱)}</span><span class="pc"></span></div></div>`).join("")}
    <div class="thanks">謝謝你的一票，我會把票高的排前面拍</div></div>`;
  el.querySelectorAll(".vopt").forEach(op => {
    op.onclick = () => { if (!localStorage.getItem(VOTE_KEY)) castVote(op.dataset.id, el); };
  });
  if (voted) showResults(el);
}
const localTally = () => { try { return JSON.parse(localStorage.getItem(VOTE_KEY + "-tally") || "{}"); } catch { return {}; } };
function castVote(id, el){
  localStorage.setItem(VOTE_KEY, id);
  const t = localTally(); t[id] = (t[id] || 0) + 1;
  localStorage.setItem(VOTE_KEY + "-tally", JSON.stringify(t));
  if (SITE.投票.API網址) fetch(SITE.投票.API網址, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ option: id }) }).catch(() => {});
  const box = el.querySelector("#voteBox");
  box.classList.add("voted"); box.querySelector(".k").textContent = "投票結果";
  showResults(el);
}
async function showResults(el){
  let counts = localTally();
  if (SITE.投票.API網址) {
    try { const r = await fetch(SITE.投票.API網址, { cache: "no-store" }); const d = await r.json(); counts = d.counts || d || counts; } catch {}
  }
  const total = Object.values(counts).reduce((a, b) => a + (+b || 0), 0) || 1;
  el.querySelectorAll(".vopt").forEach(op => {
    const pct = Math.round(((+counts[op.dataset.id] || 0) / total) * 100);
    op.querySelector(".bar").style.width = pct + "%";
    op.querySelector(".pc").textContent = pct + "%";
  });
}

/* ---------- 食譜內頁 ---------- */
function renderRecipe(){
  renderChrome("index.html");
  const id = new URLSearchParams(location.search).get("id");
  const r = PUB().find(x => x.id === id) || PUB()[0];
  if (!r) {
    document.getElementById("rd").innerHTML =
      `<div class="empty">找不到這道食譜。<br><a href="index.html" style="color:var(--強調色);border-bottom:1px solid var(--強調色);">回食譜列表</a></div>`;
    return;
  }
  document.title = `${r.料理名稱} — ${SITE.名稱}`;
  const others = PUB().filter(x => x.id !== r.id).sort(byDate).slice(0, 3);

  document.getElementById("rd").innerHTML = `
    <div class="rd-layout">
      <div class="rd-media">${videoHTML(r)}</div>
      <div>
        <div class="rd-head">
          <div class="head-row">
            ${r.系列 ? `<span class="series-tag">${esc(r.系列)}</span>` : ""}
            <span class="meta-line"><span>${r.料理時間}分鐘</span>${r.份量 ? `<span id="servings">${esc(r.份量)}</span>` : ""}</span>
          </div>
          <h1 class="rd-title">${esc(r.料理名稱)}</h1>
          <div class="rd-desc">${esc(r.介紹 || "")}</div>
        </div>
        <div class="rd-sec sec-solid">
          <div class="fl">材 料</div>
          <div class="qtybar" id="qtybar">
            <div class="seg"><button data-s="1" class="on">原份量</button><button data-s="2">×2</button></div>
            <div class="seg"><button data-u="raw" class="on">原始</button><button data-u="metric">公制</button></div>
          </div>
          <div id="ingList"></div>
          <div class="copyrow"><button class="copybtn" data-copy="ing">複製購物清單</button></div>
        </div>
        <div class="rd-sec">
          <div class="fl">作 法</div>
          ${stepsHTML(r.步驟)}
        </div>
        ${r.小技巧 ? `<div class="rd-sec"><div class="fl">小 技 巧</div>
          <div class="tipbox">${tipsHTML(r.小技巧)}</div></div>` : ""}
        <div class="copyrow"><button class="copybtn" data-copy="steptip">${r.小技巧 ? "複製作法與小技巧" : "複製作法"}</button></div>
        ${r.Reels連結 ? `<a class="igbtn" href="${r.Reels連結}" target="_blank" rel="noopener">在 IG 看這支 Reels</a>` : ""}
        <button class="igbtn sharebtn" id="sharebtn">分享這道食譜</button>
        ${(r.推薦好物 || []).length ? `<div class="rd-sec"><div class="fl">這 道 用 到 的</div>
          ${r.推薦好物.map(g => `<div class="ing-row"><b>${esc(g.名稱)}</b><a href="${g.連結}" style="color:var(--強調色);">哪裡買 →</a></div>`).join("")}</div>` : ""}
      </div>
    </div>
    ${groupBuyCard()}
    <div id="vote"></div>
    ${others.length ? `<div class="phead" style="padding-top:var(--間距-大段);"><h1>其他食譜</h1></div>
    <div class="grid">${others.map(cardHTML).join("")}</div>` : ""}`;
  bindQty(r);
  bindCopy(r);
  bindShare(`${r.料理名稱}｜${SITE.名稱}`);
  stopYTEndScreen();
  renderVote("vote");
}

/* ---------- 複製按鈕：購物清單／作法／小技巧 ---------- */
function copyToClipboard(text){
  if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
  return new Promise(res => {
    const ta = document.createElement("textarea");
    ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select();
    try { document.execCommand("copy"); } catch (e) {}
    document.body.removeChild(ta); res();
  });
}
function bindCopy(r){
  /* 注意：文字要在「按下的當下」才算，才會跟著目前的倍數／單位模式 */
  const 取文字 = key => ({
    ing: `${r.料理名稱}｜購物清單${QTY.倍數 !== 1 ? `（${QTY.倍數} 倍份量）` : ""}\n`
         + (r.食材 || []).map(i => i.分組 ? `\n【${i.分組}】` : `・${i.名稱} ${換算份量(i.份量, QTY.倍數, QTY.公制)}`).join("\n"),
    steptip: `${r.料理名稱}｜作法\n` + stepsText(r.步驟)
             + (r.小技巧 ? `\n\n小技巧\n${tipsText(r.小技巧)}` : "")
  })[key];

  document.querySelectorAll(".copybtn").forEach(b => {
    const label = b.textContent;
    b.onclick = async () => {
      await copyToClipboard(取文字(b.dataset.copy));
      b.textContent = "已複製 ✓"; b.classList.add("done");
      setTimeout(() => { b.textContent = label; b.classList.remove("done"); }, 1800);
    };
  });
}

/* ---------- 好物頁 ---------- */
function renderGoods(){
  renderChrome("goods.html");
  const seen = new Set(SITE.好物.map(g => g.名稱));
  const extra = [];
  PUB().forEach(r => (r.推薦好物 || []).forEach(g => {
    if (seen.has(g.名稱)) return;
    seen.add(g.名稱); extra.push({ ...g, 來自: r.料理名稱 });
  }));
  const all好物 = [...SITE.好物, ...extra];
  if (!all好物.length) {
    document.getElementById("goodsAll").innerHTML =
      `<div class="empty" style="grid-column:1/-1;"><b>好物推薦整理中</b>我每天真的在用的東西，整理好就放上來。</div>`;
    document.getElementById("gbGoods").innerHTML = groupBuyCard();
    return;
  }
  document.getElementById("goodsAll").innerHTML = all好物.map(g => `
    <a class="g" href="${g.連結}" target="_blank" rel="noopener">
      ${g.圖 ? `<img class="gph" src="${mediaURL(g.圖)}" alt="">` : `<div class="gph"></div>`}
      <div class="t">${esc(g.名稱)}</div>
      <div class="d">${esc(g.說明 || (g.來自 ? "用於：" + g.來自 : ""))}</div>
      <span class="s">哪裡買 →</span></a>`).join("");
  document.getElementById("gbGoods").innerHTML = groupBuyCard();
}

/* ---------- 文章列表／單篇 ---------- */
function renderBlog(){
  renderChrome("blog.html");
  const list = POSTS_PUB().sort(byDate);
  document.getElementById("grid").innerHTML = list.length ? list.map(p => `
    <a class="card" href="post.html?id=${p.id}">
      <div class="card-media">
        <img class="ph" src="${mediaURL(p.封面圖) || p.similar_圖 || ""}" alt="${esc(p.標題)}" loading="lazy" onerror="this.style.opacity=.15">
        <span class="m">${esc(p.發布日期)}・${esc(p.分類 || "")}</span>
      </div>
      <h3>${esc(p.標題)}</h3>
      <div class="ex">${esc(p.摘要 || "")}</div></a>`).join("") : `<div class="empty"><b>文章還在寫</b>團購說明、料理心得，寫好就放上來。</div>`;
}
function renderPost(){
  renderChrome("blog.html");
  const id = new URLSearchParams(location.search).get("id");
  const p = POSTS_PUB().find(x => x.id === id) || POSTS_PUB()[0];
  if (!p) { document.getElementById("post").innerHTML = `<div class="empty"><b>找不到這篇文章</b><a href="blog.html" style="color:var(--強調色);border-bottom:1px solid var(--強調色);">回文章列表</a></div>`; return; }
  document.title = `${p.標題} — ${SITE.名稱}`;
  document.getElementById("post").innerHTML = `
    <div class="phead"><h1>${esc(p.標題)}</h1><p>${esc(p.發布日期)}${p.分類 ? "・" + esc(p.分類) : ""}</p></div>
    ${p.封面圖 || p.similar_圖 ? `<img src="${mediaURL(p.封面圖) || p.similar_圖}" alt="" style="width:100%;max-width:760px;margin:20px auto;">` : ""}
    <div class="post-body">${p.內文}</div>
    <div style="max-width:680px;margin:var(--間距-組間) auto 0;">
      <button class="igbtn sharebtn" id="sharebtn">分享這篇</button>
    </div>
    ${groupBuyCard()}`;
  bindShare(`${p.標題}｜${SITE.名稱}`);
}
