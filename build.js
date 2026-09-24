/* ================================================================
   build.js —— 讓 AI／搜尋引擎讀得到食譜內容的「烤頁」腳本

   為什麼需要這個：recipe.html 的內容全部靠 JavaScript 動態填進去，
   但 ChatGPT／Perplexity 這類 AI 的爬蟲大多不會執行 JS，只看得到
   原始 HTML —— 所以每道食譜都需要一份「內容已經寫死在 HTML 裡」的
   靜態頁，AI 才找得到、看得懂。

   這支腳本會讀 assets/data.js，幫每道「已發布」的食譜產生一份
   recipe-<id>.html（跟 assets/app.js 的 recipeHTML() 用同一段樣板，
   保證跟線上即時渲染長一模一樣），並附上標題／說明／Recipe 結構化
   資料，文章（POSTS）同理產生 post-<id>.html。同時重新產生 sitemap.xml。

   ⚠️ 什麼時候要跑：在 assets/data.js 改了食譜內容之後、git push 之前，
   在這個資料夾下執行：
       node build.js
   （這份專案沒有其他建置流程，純粹跑這一支就好，跑完會把改動的檔案
   印出來，直接 git add 進同一個 commit 一起推。）
   ================================================================ */

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = __dirname;
const SITE_URL = "https://faytaitai.github.io/fay-recipes/";

/* ---------- 把 data.js + app.js 丟進一個沒有瀏覽器的沙盒執行，
   這樣才能直接呼叫 recipeHTML()／cardHTML() 這些純函式，
   跟網頁上即時渲染出來的 HTML 保證一模一樣，不用另外維護一份樣板。 ---------- */
function loadSandbox(){
  const dataCode = fs.readFileSync(path.join(ROOT, "assets/data.js"), "utf8");
  const appCode = fs.readFileSync(path.join(ROOT, "assets/app.js"), "utf8");
  const sandbox = {
    console,
    location: { origin: SITE_URL.replace(/\/$/, ""), pathname: "", search: "" },
  };
  vm.createContext(sandbox);
  vm.runInContext(
    dataCode + "\n" + appCode + "\n" +
    "globalThis.__SITE=SITE; globalThis.__RECIPES=RECIPES; globalThis.__POSTS=(typeof POSTS!=='undefined'?POSTS:[]);" +
    "globalThis.__PUB=PUB; globalThis.__byDate=byDate; globalThis.__esc=esc; globalThis.__tagsOf=tagsOf;" +
    "globalThis.__mediaURL=mediaURL; globalThis.__recipeHTML=recipeHTML; globalThis.__cardHTML=cardHTML;" +
    "globalThis.__POSTS_PUB=POSTS_PUB; globalThis.__postHTML=postHTML;",
    sandbox
  );
  return sandbox;
}

const abs = (ctx, p) => {
  const s = ctx.__mediaURL(p);
  if (!s) return "";
  return /^https?:\/\//.test(s) ? s : SITE_URL + s.replace(/^\/+/, "");
};

/* ---------- 步驟／小技巧的 "## 分組標題" 轉成 schema.org 的 HowToSection ---------- */
function stepsForSchema(steps){
  const isHead = x => typeof x === "string" && x.startsWith("## ");
  const flat = [];
  let currentGroup = null;
  (steps || []).forEach(x => {
    if (isHead(x)) {
      currentGroup = { "@type": "HowToSection", name: x.slice(3).trim(), itemListElement: [] };
      flat.push(currentGroup);
    } else {
      const step = { "@type": "HowToStep", text: x };
      (currentGroup ? currentGroup.itemListElement : flat).push(step);
    }
  });
  return flat;
}

function ingredientsForSchema(食材){
  return (食材 || []).filter(i => !i.分組).map(i => `${i.名稱} ${i.份量 || ""}`.trim());
}

function recipeJSONLD(ctx, r){
  const json = {
    "@context": "https://schema.org/",
    "@type": "Recipe",
    name: r.料理名稱,
    description: r.介紹 || r.料理名稱,
    image: [abs(ctx, r.封面圖)].filter(Boolean),
    author: { "@type": "Person", name: "Fay" },
    datePublished: r.發布日期,
    recipeCategory: r.分類 || undefined,
    keywords: ctx.__tagsOf(r).join(", ") || undefined,
    recipeIngredient: ingredientsForSchema(r.食材),
    recipeInstructions: stepsForSchema(r.步驟),
  };
  if (r.份量) json.recipeYield = r.份量;
  if (r.料理時間) json.totalTime = `PT${r.料理時間}M`;
  if (r.影片網址) {
    json.video = {
      "@type": "VideoObject",
      name: r.料理名稱,
      description: r.介紹 || r.料理名稱,
      thumbnailUrl: [abs(ctx, r.封面圖)].filter(Boolean),
      uploadDate: r.發布日期,
      contentUrl: r.影片網址,
    };
  }
  Object.keys(json).forEach(k => json[k] === undefined && delete json[k]);
  return JSON.stringify(json, null, 2);
}

function pageHTML(ctx, r, others){
  const title = `${esc(ctx.__SITE.短名)}｜${esc(r.料理名稱)}`;
  const desc = esc(r.介紹 || r.料理名稱);
  const url = SITE_URL + `recipe-${r.id}.html`;
  const img = abs(ctx, r.封面圖);
  return `<!DOCTYPE html>
<html lang="zh-Hant">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<meta name="description" content="${desc}">
<link rel="canonical" href="${url}">
<meta property="og:type" content="article">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${desc}">
<meta property="og:url" content="${url}">
${img ? `<meta property="og:image" content="${img}">\n` : ""}<meta property="og:site_name" content="${esc(ctx.__SITE.名稱)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${title}">
<meta name="twitter:description" content="${desc}">
${img ? `<meta name="twitter:image" content="${img}">\n` : ""}<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;700&family=Noto+Sans+TC:wght@300;400;500;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="assets/style.css">
<script type="application/ld+json">
${recipeJSONLD(ctx, r)}
</script>
</head>
<body>
<header id="header"></header>
<div class="announce" id="announce" style="display:none;"></div>
<div class="wrap" id="rd">${ctx.__recipeHTML(r, others)}</div>
<footer><div class="wrap" id="footer"></div></footer>
<script src="assets/data.js"></script>
<script src="assets/app.js"></script>
<script>renderRecipe();</script>
</body>
</html>
`;
}

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));

function buildRecipePages(ctx){
  const pub = ctx.__PUB().slice().sort(ctx.__byDate);
  const written = [];
  pub.forEach(r => {
    const others = pub.filter(x => x.id !== r.id).slice(0, 3);
    const html = pageHTML(ctx, r, others);
    const file = path.join(ROOT, `recipe-${r.id}.html`);
    fs.writeFileSync(file, html, "utf8");
    written.push(`recipe-${r.id}.html`);
  });
  return { pub, written };
}

function postJSONLD(ctx, p){
  const json = {
    "@context": "https://schema.org/",
    "@type": "Article",
    headline: p.標題,
    description: p.摘要 || p.標題,
    image: [abs(ctx, p.封面圖)].filter(Boolean),
    author: { "@type": "Person", name: "Fay" },
    datePublished: p.發布日期,
    dateModified: p.發布日期,
    mainEntityOfPage: SITE_URL + `post-${p.id}.html`,
  };
  Object.keys(json).forEach(k => json[k] === undefined && delete json[k]);
  return JSON.stringify(json, null, 2);
}

function postPageHTML(ctx, p){
  const title = `${esc(ctx.__SITE.短名)}｜${esc(p.標題)}`;
  const desc = esc(p.摘要 || p.標題);
  const url = SITE_URL + `post-${p.id}.html`;
  const img = abs(ctx, p.封面圖);
  return `<!DOCTYPE html>
<html lang="zh-Hant">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<meta name="description" content="${desc}">
<link rel="canonical" href="${url}">
<meta property="og:type" content="article">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${desc}">
<meta property="og:url" content="${url}">
${img ? `<meta property="og:image" content="${img}">\n` : ""}<meta property="og:site_name" content="${esc(ctx.__SITE.名稱)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${title}">
<meta name="twitter:description" content="${desc}">
${img ? `<meta name="twitter:image" content="${img}">\n` : ""}<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;700&family=Noto+Sans+TC:wght@300;400;500;700&family=Noto+Serif+TC:wght@600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="assets/style.css">
<script type="application/ld+json">
${postJSONLD(ctx, p)}
</script>
</head>
<body>
<header id="header"></header>
<div class="announce" id="announce" style="display:none;"></div>
<div class="wrap" id="post">${ctx.__postHTML(p)}</div>
<footer><div class="wrap" id="footer"></div></footer>
<script src="assets/data.js"></script>
<script src="assets/app.js"></script>
<script>renderPost();</script>
</body>
</html>
`;
}

function buildPostPages(ctx){
  const pub = ctx.__POSTS_PUB().slice().sort(ctx.__byDate);
  const written = [];
  pub.forEach(p => {
    fs.writeFileSync(path.join(ROOT, `post-${p.id}.html`), postPageHTML(ctx, p), "utf8");
    written.push(`post-${p.id}.html`);
  });
  return { pub, written };
}

function buildRobots(){
  const txt = `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}sitemap.xml\n`;
  fs.writeFileSync(path.join(ROOT, "robots.txt"), txt, "utf8");
}

function buildSitemap(pub, posts){
  const staticPages = ["index.html", "about.html", "blog.html", "goods.html", "vote.html", "tools.html"];
  const today = new Date().toISOString().slice(0, 10);
  const urls = [
    ...staticPages.map(p => ({ loc: SITE_URL + p, lastmod: today })),
    ...pub.map(r => ({ loc: SITE_URL + `recipe-${r.id}.html`, lastmod: r.發布日期 || today })),
    ...posts.map(p => ({ loc: SITE_URL + `post-${p.id}.html`, lastmod: p.發布日期 || today })),
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls.map(u => `  <url><loc>${u.loc}</loc><lastmod>${u.lastmod}</lastmod></url>`).join("\n") +
    `\n</urlset>\n`;
  fs.writeFileSync(path.join(ROOT, "sitemap.xml"), xml, "utf8");
}

function main(){
  const ctx = loadSandbox();
  const { pub, written } = buildRecipePages(ctx);
  const { pub: posts, written: postFiles } = buildPostPages(ctx);
  buildRobots();
  buildSitemap(pub, posts);
  console.log(`已產生 ${written.length} 份食譜靜態頁、${postFiles.length} 份文章靜態頁：`);
  written.concat(postFiles).forEach(f => console.log("  " + f));
  console.log("已更新 robots.txt、sitemap.xml");
}

main();
