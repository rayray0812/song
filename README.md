# 社團報歌表

手機優先的社團報歌網頁，可新增歌曲、歌詞、各樂器人員，自動統計每個人的參與歌曲數，並可依人員篩選歌曲。未填的人員欄位不會顯示在報歌列表。

## 技術規劃

- 前端：原生 HTML / CSS / JavaScript，沒有建置步驟，適合免費部署到 GitHub Pages 或 Cloudflare Pages。
- 後端：Supabase Free Plan，使用 Postgres 儲存歌曲與社員名單。
- 本機預覽：未設定 Supabase 時會自動使用瀏覽器 `localStorage`，可直接打開 `index.html` 測試。

## 上線步驟

1. 到 Supabase 建立免費專案。
2. 在 Supabase SQL Editor 貼上 `supabase-schema.sql` 並執行。
3. 到 Project Settings > API 複製 Project URL 與 anon public key。
4. 編輯 `supabase-config.js`，填入：

```js
window.SUPABASE_CONFIG = {
  url: "https://YOUR_PROJECT_ID.supabase.co",
  anonKey: "YOUR_SUPABASE_ANON_KEY",
};
```

5. 將整個資料夾部署到 GitHub Pages 或 Cloudflare Pages。

## 檔案

- `index.html`：頁面結構
- `styles.css`：手機優先樣式
- `app.js`：表單、統計、篩選、Supabase 同步
- `supabase-schema.sql`：Supabase 資料表與權限
- `supabase-config.js`：正式站的 Supabase 設定

## 注意

目前 SQL 權限設定是「知道網址的人都可以讀寫」，適合社團內部簡單使用。若要防止外人修改資料，下一步應加上登入或邀請碼。
