# 社團報歌表

手機優先的社團報歌網頁，可新增歌曲、歌詞、各樂器人員，自動統計每個人的參與歌曲數，並可依人員篩選歌曲。未填的人員欄位不會顯示在報歌列表。

## 技術規劃

- 前端：原生 HTML / CSS / JavaScript，沒有建置步驟，適合免費部署到 GitHub Pages 或 Cloudflare Pages。
- 後端：Supabase Free Plan，使用 Postgres 儲存歌曲與社員名單。
- 本機預覽：未設定 Supabase 時報歌主頁 (`index.html`) 會自動改用瀏覽器 `localStorage`，可直接打開測試。刷歌頁 (`cull.html`) 必須有 Supabase 才能使用。

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

5. 在 Supabase SQL Editor 執行下列指令，把刷歌頁密語換成自訂值（用 bcrypt 雜湊，原始密語不會留在資料庫）：

```sql
update public.app_settings
set value = extensions.crypt('YOUR_PASSPHRASE', extensions.gen_salt('bf', 10))
where key = 'cull_passphrase_hash';
```

未執行這一步前 `cull.html` 會一律拒絕登入。

6. 將整個資料夾部署到 GitHub Pages 或 Cloudflare Pages。

## 檔案

- `index.html`：頁面結構
- `styles.css`：手機優先樣式
- `app.js`：表單、統計、篩選、Supabase 同步
- `supabase-schema.sql`：Supabase 資料表與權限
- `supabase-config.js`：正式站的 Supabase 設定

## 注意

目前 SQL 權限設定是「知道網址的人都可以讀寫歌曲與社員資料」，適合社團內部簡單使用。刷歌頁的「刷掉 / 留下」狀態則受密語保護，需透過 `set_song_eliminated` RPC 變更。若要防止外人修改其他資料，下一步應加上登入或邀請碼。
