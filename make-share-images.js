/* ================================================================
   make-share-images.js —— 為每道已發布食譜產生橫式分享預覽圖

   為什麼：食譜封面是直式（9:16），貼到 LINE／FB／IG 時會被裁成橫的，
   只剩中間一條。這支腳本為每道食譜、每篇文章另外畫一張 1200×630 的橫圖
   （左邊封面、右邊標題），食譜存成 media/og-<id>.jpg、文章存成
   media/og-post-<id>.jpg，build.js 會優先用它們當分享預覽。

   用法（在這個資料夾）：
     node make-share-images.js          只補還沒有的
     node make-share-images.js --force  全部重畫（改版面或改菜名後用）

   需要：Google Chrome（無頭模式截圖）、macOS 的 sips（轉 JPEG）、
   網路（載入 Google Fonts）。畫完要再跑 node build.js。
   ================================================================ */

const fs = require("fs");
const os = require("os");
const path = require("path");
const vm = require("vm");
const { execFileSync } = require("child_process");

const ROOT = __dirname;
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const FORCE = process.argv.includes("--force");

function loadData(){
  const code = fs.readFileSync(path.join(ROOT, "assets/data.js"), "utf8");
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(code + "\nglobalThis.__R = RECIPES; globalThis.__P = (typeof POSTS !== 'undefined' ? POSTS : []);", ctx);
  return { recipes: ctx.__R.filter(r => r.狀態 === "已發布"), posts: ctx.__P.filter(p => p.狀態 === "已發布") };
}

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));

function html(r, coverPath){
  /* 名字遇到「＋」就在它後面斷行（兩份食譜合併的標題）；字級依最長那一行縮放，能一行放下就不換行 */
  const parts = r.料理名稱.split("＋");
  const lines = parts.map((x, i) => i < parts.length - 1 ? x + "＋" : x);
  const longest = Math.max(...lines.map(x => x.length));
  /* 可用寬度約 564px，每個字另有 1px 字距，所以多留一點餘裕；每行都不准再自己換行（太長的名字才放行） */
  const size = Math.max(50, Math.min(88, Math.floor(560 / longest) - 2));
  const nameHTML = lines.map(x => longest <= 11 ? `<span style="white-space:nowrap">${esc(x)}</span>` : esc(x)).join("<br>");
  const meta = [r.料理時間 ? `${r.料理時間}分鐘` : "", ...(r.料理工具 || [])].filter(Boolean).join("・");
  return `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@500;700&family=Noto+Sans+TC:wght@400;500;700&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:1200px;height:630px;overflow:hidden}
body{background:#FAF5F2;font-family:'Noto Sans TC','Outfit',sans-serif;color:#1F1D1B;position:relative}
.cover{position:absolute;left:0;top:0;width:504px;height:630px;object-fit:cover}
.txt{position:absolute;left:504px;top:0;width:696px;height:630px;padding:56px 64px 52px 68px;display:flex;flex-direction:column}
.brand{font-size:23px;color:#63605B;letter-spacing:2px}
.mid{flex:1;display:flex;flex-direction:column;justify-content:center}
.bar{width:64px;height:6px;background:#C0553F;margin-bottom:30px}
.name{font-weight:700;font-size:${size}px;line-height:1.28;letter-spacing:1px}
.meta{font-size:28px;color:#63605B;margin-top:28px;letter-spacing:2px}
.at{font-family:'Outfit';font-size:26px;color:#C0553F;letter-spacing:1.5px;font-weight:500}
</style></head><body>
<img class="cover" src="file://${encodeURI(coverPath)}">
<div class="txt">
  <div class="brand">Fay太太｜把煮飯變簡單</div>
  <div class="mid"><div class="bar"></div><div class="name">${nameHTML}</div><div class="meta">${esc(meta)}</div></div>
  <div class="at">@faytaitai</div>
</div>
</body></html>`;
}

function postHTML(p, coverPath){
  const long = p.標題.length > 14;
  return `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@500;700&family=Noto+Sans+TC:wght@400;500;700&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:1200px;height:630px;overflow:hidden}
body{background:#FBF2E9;font-family:'Noto Sans TC','Outfit',sans-serif;color:#1F1D1B;position:relative}
.pic{position:absolute;left:0;top:0;width:620px;height:630px;overflow:hidden}
.pic img{position:absolute;left:-60px;bottom:0;width:821px;height:auto}
.txt{position:absolute;left:620px;top:0;width:580px;height:630px;padding:56px 56px 52px 28px;display:flex;flex-direction:column}
.brand{font-size:23px;color:#63605B;letter-spacing:2px}
.mid{flex:1;display:flex;flex-direction:column;justify-content:center}
.cat{font-size:24px;color:#C0553F;letter-spacing:4px;font-weight:700;margin-bottom:22px}
.name{font-weight:700;font-size:${long ? 54 : 70}px;line-height:1.4;letter-spacing:1px;text-wrap:balance}
.at{font-family:'Outfit';font-size:26px;color:#C0553F;letter-spacing:1.5px;font-weight:500}
</style></head><body>
<div class="pic"><img src="file://${encodeURI(coverPath)}"></div>
<div class="txt">
  <div class="brand">Fay太太｜把煮飯變簡單</div>
  <div class="mid">${p.分類 ? `<div class="cat">${esc(p.分類)}</div>` : ""}<div class="name">${esc(p.標題)}</div></div>
  <div class="at">@faytaitai</div>
</div>
</body></html>`;
}

function shoot(htmlString, name, out){
  const page = path.join(tmp, `${name}.html`), png = path.join(tmp, `${name}.png`);
  fs.writeFileSync(page, htmlString, "utf8");
  execFileSync(CHROME, ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=1",
    "--window-size=1200,630", "--virtual-time-budget=10000", `--screenshot=${png}`, "file://" + encodeURI(page)], { stdio: "ignore" });
  execFileSync("sips", ["-s", "format", "jpeg", "-s", "formatOptions", "85", png, "--out", out], { stdio: "ignore" });
  console.log(`已產生 ${path.relative(ROOT, out)}（${Math.round(fs.statSync(out).size / 1024)}KB）`);
}

if (!fs.existsSync(CHROME)) { console.error("找不到 Google Chrome：" + CHROME); process.exit(1); }
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "share-"));
const { recipes, posts } = loadData();
let made = 0, skipped = 0;
const jobs = [
  ...recipes.map(r => ({ key: r.id, out: `og-${r.id}.jpg`, cover: r.封面圖, make: c => html(r, c) })),
  ...posts.map(p => ({ key: "post-" + p.id, out: `og-post-${p.id}.jpg`, cover: p.封面圖, make: c => postHTML(p, c) })),
];
for (const j of jobs) {
  const out = path.join(ROOT, "media", j.out);
  const cover = path.join(ROOT, String(j.cover || ""));
  if (!j.cover || !fs.existsSync(cover)) { console.log(`略過（找不到封面圖）：${j.key}`); continue; }
  if (fs.existsSync(out) && !FORCE) { skipped++; continue; }
  shoot(j.make(cover), j.key, out);
  made++;
}
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`完成：新產生 ${made} 張，已存在略過 ${skipped} 張。記得接著跑 node build.js`);
