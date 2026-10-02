# Fay 食譜網站

## 先講結論
- 純靜態網站（HTML／CSS／原生 JS），沒有框架、沒有 npm。託管在 GitHub Pages，推到 `main` 約 1–2 分鐘自動上線。
- 本機位置：`~/Documents/fay-recipes/`（Git 倉庫，遠端 `faytaitai/fay-recipes`，**公開**）。
- 線上網址：https://faytaitai.github.io/fay-recipes/
- 素材在 iCloud，不在這個資料夾：`~/Library/Mobile Documents/com~apple~CloudDocs/Fay工作台/網站素材/`（不上傳）。封面縮圖放在它底下的 `影片原始檔/`。
- 內容都在 `assets/data.js`；邏輯 `assets/app.js`；樣式 `assets/style.css`。
- 改完內容一定要跑 `node build.js`，再一起 commit＋push。

## 公開倉庫規則
`fay-recipes` 是公開倉庫。
任何私人內容都不要放進這個資料夾：
金鑰、密碼、未公開的名單、個人文件。
push 上去之後全世界都看得到，而且 Git 歷史永久保留，刪不掉。
私人素材一律留在 iCloud 的 網站素材/。

## 區塊與位置
- 食譜牆 `index.html`；食譜頁 `recipe-<id>.html`（自動產生，勿手改）
- 文章 `blog.html`；單篇 `post-<id>.html`（自動產生，勿手改）
- 好物 `goods.html`、投票 `vote.html`、蛋白質計算機 `tools.html`、關於我 `about.html`
- 自動產生：`recipe-*.html`、`post-*.html`、`sitemap.xml`、`robots.txt`
- 舊連結 `recipe.html?id=` 與 `post.html?id=` 會自動跳轉，`recipes.html` 跳轉到首頁
- `說明.md`、`上線檢查清單.md`、`預覽用_*.html` 是早期草稿，內容已過時，以這份為準（它們被 `.gitignore` 擋掉，不會上傳）

## 部署流程（確切步驟）
1. 改 `assets/data.js`（或 `app.js`、`style.css`）
2. 跑 `node build.js`（產生靜態頁與 sitemap；沒跑，AI 和搜尋引擎讀到的是舊內容，其他食譜頁的「其他食譜」也不會更新）
3. 本機預覽：`python3 -m http.server 8934`，用手機尺寸看
4. `git add` 具體檔案（不要 `git add -A`）→ commit → `git push origin main`
5. 等 1–2 分鐘，**開線上網址實際確認**（強制重整，瀏覽器快取 10 分鐘）；不是看到 push 成功就算完成
- 不要放進 commit：`影片原始檔/`、`預覽用_*.html`、其他 `.md`（只有 `CLAUDE.md` 例外）
- commit 訊息不要放單引號（macOS 預設 bash 3.2 會讓指令壞掉）

## 上架一道食譜
1. Fay 給 YouTube 網址＋文字；縮圖用 `ls -laT` 找 `影片原始檔/` 裡最新的檔
2. 縮圖複製成 `media/<id>.jpg`，食譜加進 `data.js` 的 `RECIPES`
3. 跑 `node build.js`，一起 commit＋push，開線上網址確認

## 樣式規則
- 顏色、字級、間距一律用 `style.css` 最上面 `:root` 的變數，不要新發明
- 手機優先；電腦版斷點 860px（文章列表 960px）
- 文章雜誌版用 `.mag-*`（墨青 `--mag-main`）；少數元件（汞含量標籤、烹飪模式的綠勾）有寫死的顏色

## 內容格式
- 食譜 id：英文小寫連字號；封面圖 `media/<id>.jpg`
- 食材照原文分組：`{ 分組: "醃料" }` 後接該組食材；只放原文明確屬於該組的項目，不確定就單獨列在「食材」或問 Fay
- 步驟提到組名（如「加入所有醃料」），烹飪模式會自動列出該組食材（只列第一次提到的那一步）；「食材」「材料」這種泛稱組名不比對
- 一支影片兩份食譜：步驟、小技巧用 `"## 組名"` 一行分段
- 步驟備註：`"主文。｜小字備註"`
- 小技巧用全形空白「　」分句
- 單位：°C、ml、g、大匙15ml、不用「杯」（日式 1 杯＝200ml、美式 240ml）；原文明顯打錯的（如 180°F）直接修正並告訴 Fay
- 沒份量、沒 Reels 連結：留空字串（網站自動隱藏）

## 命名慣例
- `data.js` 欄位用中文；檔名與 id 用英文小寫連字號
- 食譜標題用 Fay 文字裡的名稱，封面圖上字不一樣時在回報提一下

## 踩過的坑
- 忘了 `node build.js`
- GitHub Pages 快取 10 分鐘，要強制重整
- YouTube 播放器錯誤 153：多半是影片沒開「允許嵌入」，或用雙擊檔案（`file://`）開
- `gh` 指令在 `~/.local/bin/gh`，不在 PATH 裡，要用完整路徑
- 封面圖每張約 0.7–1.1MB 沒壓縮，食譜變多後手機會慢
- `build.js` 裡的網址是寫死的，之後換自訂網域要同步改
- 烹飪模式的打勾進度存在瀏覽器的 sessionStorage，以食譜 id 為 key

## 換新電腦
- `git clone https://github.com/faytaitai/fay-recipes.git ~/Documents/fay-recipes`，不需要搬資料夾
- 需要 Node 18 以上（只用來跑 `build.js`，不用裝任何套件）
- 推送需要登入 GitHub（`gh auth login` 或 git 憑證），並設定 `git config user.name` 與 `user.email`
- `.gitignore` 擋掉的檔案（早期草稿、`預覽用_*.html`）不會跟著 clone，本來就不需要
- 素材在 iCloud，新電腦登入同一個 Apple ID 就會同步

## 我的偏好
- 繁體中文、白話；先講結論再講細節
- 表格的儲存格內容用斷行呈現，不要擠成一行
- 一次想到位、直接做完，不要讓我反覆手動操作
- 做完要實際驗證（開線上網址），不要只說「完成了」
- 需要密碼、API 金鑰、登入的地方，停下來問我，不要自己填
