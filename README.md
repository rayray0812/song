# 社團報歌表

手機優先的社團報歌網頁，可新增歌曲、歌詞、各樂器人員，自動統計每個人的參與歌曲數，並可依人員篩選歌曲。未填的人員欄位不會顯示在報歌列表。

## 技術規劃

- 前端：原生 HTML / CSS / JavaScript，沒有建置步驟，適合免費部署到 GitHub Pages 或 Cloudflare Pages。
- 資料：`site-data.js` 內建目前匯出的歌曲、社員名單、刷歌狀態與評語。後續在頁面上的變更會存在瀏覽器 `localStorage`。
- 本機預覽：可直接打開 `index.html` 或 `cull.html` 測試，不需要資料庫或建置步驟。

## 上線步驟

1. 將整個資料夾部署到 GitHub Pages 或 Cloudflare Pages。
2. 若需要更新內建資料，重新產生 `site-data.js` 後再部署。

## 檔案

- `index.html`：頁面結構
- `styles.css`：手機優先樣式
- `site-data.js`：從原資料庫匯出的靜態資料
- `app.js`：表單、統計、篩選、本機保存
- `cull.html` / `cull.js`：刷歌、排程、評語、本機保存

## 注意

移除資料庫後，不同裝置之間不會自動同步。頁面會先讀 `site-data.js` 的初始資料，使用者在瀏覽器內新增、刪除、刷歌、排程或評語，只會保存在該瀏覽器的 `localStorage`。
