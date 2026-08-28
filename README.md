# 梯形校正工作台（Cloudflare Workers）

一個以瀏覽器端 WebGL 處理為核心的批量圖片梯形校正 SPA：支援批量上傳、四角拖曳、透視校正重映射、JPG / PNG / WEBP 輸出、一鍵 ZIP 批量下載。

## ✨ 特色亮點
- **極速本機處理**：所有梯形校正與透視轉換皆在瀏覽器端 WebGL 運算，原圖不經過伺服器，安全且隱私度高。
- **批量作業**：支援多張圖片拖曳上傳，每張圖片獨立記錄四角錨點與旋轉角度。
- **高精準透視重映射**：直接透過 8 參數單應性矩陣（Homography）進行幾何逆轉換與雙線性插值取樣。
- **一鍵打包 ZIP**：整合 JSZip，批量校正後自動打包下載，避免瀏覽器攔截多檔案彈窗。
- **Cloudflare Workers 靜態託管**：透過 Cloudflare Workers Static Assets 全球 CDN 加速分發。

---

## 🚀 本機開發

```bash
# 安裝依賴
npm install

# 啟動本機開發伺服器
npx wrangler dev
```

---

## 🌐 自動化部署（GitHub Actions -> Cloudflare Workers）

當程式碼推送至 GitHub 的 `main` 分支時，GitHub Actions 會自動執行部署：

### 必備 GitHub Secrets 設定：
前往您的 GitHub 專案頁面：`Settings` -> `Secrets and variables` -> `Actions` -> `New repository secret`，新增以下兩個變數：

1. **`CLOUDFLARE_API_TOKEN`**：
   - 前往 [Cloudflare Dashboard - API Tokens](https://dash.cloudflare.com/profile/api-tokens)
   - 點擊「Create Token」-> 選擇「Edit Cloudflare Workers」範本建立 Token。
2. **`CLOUDFLARE_ACCOUNT_ID`**：
   - 位於 Cloudflare Dashboard 右側側邊欄的「Account ID（帳戶 ID）」。

---

## 🛠️ 手動本機部署
```bash
npx wrangler deploy
```

