# Pobi Media - 多媒體與 PDF 專業工作站

Pobi Media 是一套現代化、以隱私為核心的雲端與本地混合多媒體處理工作站。部署於 Cloudflare Workers 全球邊緣網路，整合 WebGL 硬體加速、WASM 引擎與 Google Gemini 2.5 Flash AI 模型，提供高效、無延遲且高隱私的生產力工具。

---

## 核心功能模組

### 1. 透視校正 (Perspective Corrector)
- **WebGL 硬體加速**：利用單應性矩陣（Homography）與雙線性插值，在瀏覽器端即時拉平拍攝歪斜的文件、白板、證件。
- **直覺四角調整**：支援即時拖曳 4 個角點、自動置中、90° 順逆時針旋轉。
- **跨工具無縫流轉**：校正完成後可一鍵傳送至「去背景」、「OCR 文字辨識」或「PDF 轉檔與合成」。
- **批次處理**：支援多圖批次校正並一鍵打包為 ZIP 壓縮檔。

### 2. 格式轉換與 PDF (Format Converter & PDF Merger)
- **多圖/文件合併 PDF**：將多張 JPG、PNG、WEBP、SVG 或純文字 TXT/MD 檔案按順序編排，自動合併輸出為標準 PDF。
- **版面自由定製**：支援標準 A4、US Letter 或按原圖比例（Fit to Image），並可設定邊距（Margin）。
- **批次圖片格式轉換**：支援 JPG / PNG / WEBP 互相轉換與品質壓縮調整。

### 3. PDF 頁面分割 (PDF Splitter)
- **雙頁掃描對切**：專為書籍、雜誌、合約的跨頁掃描檔設計。
- **垂直/水平視覺化分割線**：在畫布上直接拖曳紅色虛線自訂切割比例，或使用 50/50 一鍵對切預設。
- **閱讀順序調整**：支援標準從左到右 (LTR) 與書籍/漫畫從右到左 (RTL) 排版。
- **純前端無失真裁切**：透過 `pdf-lib` 與 `pdf.js` 直接在瀏覽器解析與重構 PDF 物件，檔案不上傳伺服器。

### 4. 文字辨識 OCR (Text Recognition)
- **雙軌辨識架構**：
  - **Tesseract.js WASM**：100% 離線純本地運算，支援繁中、簡中、英文、日文。
  - **Google Gemini 2.5 Flash 視覺模型**：超高精準度，能智慧還原表格 Markdown 排版、公文印鑑與段落層級。
- **自由框選範圍**：支援全圖辨識或以矩形局部框選特定區域辨識。
- **結果匯出**：一鍵複製文字、下載 `.txt` 或 `.md` 檔案。

### 5. 背景去除 (Background Remover)
- **極速演算法 + AI 雙模**：
  - **純演算法魔術棒**：泛洪演算法點選去背、白色底/純色印章一鍵透明化、容差與邊緣羽化調節。
  - **Gemini AI 語意分割**：智慧識別複雜主體邊緣。
- **手動筆刷修補**：提供「擦除背景」與「保留主體」筆刷細節修整。
- **背景替換**：支援透明棋盤格 PNG 輸出，或一鍵替換白底、紅底/藍底證件照。

### 6. 會員帳號與訪客體驗閘門 (Auth Gate)
- **登入與註冊入口**：進入工作台前提供現代化登入與註冊介面，支援個人帳號建立與狀態記憶。
- **訪客直接體驗**：提供「以訪客身份直接體驗」按鈕，免註冊即可快速開始使用。
- **頂部使用者身分**：顯示當前使用者狀態，並支援快速登出與個人 API 設定。

### 7. 管理者專屬控制台 (Admin Console)
- **刪除使用者**：檢視註冊使用者清單，搜尋並刪除無效或違規帳號。
- **使用者回饋中心**：檢視使用者提交之問題回報 (Bug)、功能建議與諮詢，並可標記完成與清理。
- **協助重設密碼**：管理者可協助忘記密碼之使用者快速重設或產生新密碼。
- **管理公用 API**：設定、覆寫與測試伺服器端公用 Gemini 2.5 Flash 端點狀態與配額健康度。
- **極致隱私保護**：管理者**嚴格無法查看**使用者各自申請的私有 API Key（私有金鑰 100% 留存於使用者瀏覽器本地端，伺服器與後台完全隔離）。

---

## 隱私與 API 安全性設計

本專案遵循**零信任 (Zero-Trust) 與金鑰隔離原則**：
1. **絕無金鑰外洩風險**：GitHub 程式碼倉庫中**絕對不包含任何 API Key**。
2. **自備 API Key 100% 本地存儲**：使用者自備的 Gemini API Key 僅存放於個人瀏覽器的 `localStorage` 中，所有 AI 請求由瀏覽器直連 Google 官方端點（`generativelanguage.googleapis.com`），絕不經過或儲存於 Cloudflare 伺服器。
3. **管理者無法調閱私有金鑰**：即便使用管理員帳號登入，後台亦無任何讀取或調閱他人私有金鑰的管道。
4. **公用金鑰邊緣隔離**：站長提供的公用 API Key 存放在 Cloudflare Workers 專屬加密 Secrets (`GEMINI_API_KEY`) 中，配合 IP 每日 5 次限流與全局防護，防止被惡意盜刷。

---

## Cloudflare Workers 設定與部署指南

### 步驟 1：本機開發與建置
```bash
# 1. 安裝相依套件
npm install

# 2. 建置前端 SPA
npm run build

# 3. 啟動本機預覽
npm run dev
```

### 步驟 2：設定 Cloudflare 公用 Gemini API Key (選填)
若您希望提供所有訪客每日 5 次的公用免費 AI 額度：
1. 透過 Wrangler CLI 寫入加密密鑰：
   ```bash
   npx wrangler secret put GEMINI_API_KEY
   # 輸入您的 Google Gemini API Key (來自 Google AI Studio)
   ```
2. 或在 Cloudflare Dashboard 後台設定：
   - 登入 [Cloudflare Dashboard](https://dash.cloudflare.com/)
   - 進入 **Workers & Pages** -> 點選您的 Worker (`pobi-media`)
   - 進入 **Settings** -> **Variables and Secrets**
   - 點擊 **Add** -> 選擇 **Secret** -> 變數名稱填寫 `GEMINI_API_KEY`，值填入您的 API Key 後儲存並部署。

### 步驟 3：部署至 Cloudflare Workers
```bash
npm run deploy
```

---

## GitHub Actions 自動持續部署 (CI/CD)

當推送程式碼至 GitHub `main` 分支時，GitHub Actions 會自動建置並部署至 Cloudflare。

請至 GitHub 儲存庫設定 `Settings` -> `Secrets and variables` -> `Actions` -> `New repository secret`：
- `CLOUDFLARE_API_TOKEN`：Cloudflare API 權杖（需具備 Edit Cloudflare Workers 權限）
- `CLOUDFLARE_ACCOUNT_ID`：您的 Cloudflare 帳戶 ID

---

## 授權條款
MIT License


