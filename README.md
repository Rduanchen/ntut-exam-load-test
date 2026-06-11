# K6-Test 分散式壓力測試系統：完整使用手冊

這是一份為 `k6-test` 專案量身打造的完整說明書。本系統為一個基於 Node.js 與 k6 構建的 Master-Slave 分散式壓力測試架構，專門針對考試系統的複雜邏輯與加解密流程進行效能測試。它不僅解決了多台機器同時壓測時的帳號碰撞問題，更支援「跳過加密」與「完整模擬加密」兩種測試維度。

---

## 壹、 環境準備與 k6 安裝

在啟動 Slave 節點或執行本地測試之前，您必須在負責發送請求的實體機器上安裝 `k6`。

### macOS
使用 Homebrew 安裝：
```bash
brew install k6
```

### Windows
使用 Winget 安裝：
```cmd
winget install k6
```
或者從 [k6 官方發布頁面](https://github.com/grafana/k6/releases) 下載最新的 `.msi` 安裝檔。

### Linux (Debian/Ubuntu)
```bash
sudo gpg -k
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update
sudo apt-get install k6
```

---

## 貳、 核心系統架構與元件

本系統主要由以下幾個核心元件組成：

1. **CLI 互動介面 (Command Line Interface)**
   - 透過 `inquirer` 提供的互動式終端介面，讓開發者或測試人員可以簡單地透過選單產生資料、啟動節點或發動測試。
2. **Master 中控台**
   - 負責讀取測試設定檔（Seed Data），將測試帳號平均分配給所有連線的 Slave。
   - 監聽 Slave 的註冊，並在使用者按下 Enter 後同步發送啟動訊號（Start Signal）。
   - 收集所有 Slave 測試完畢後回傳的報表，並進行資料聚合（Aggregate）。
3. **Slave 工作節點**
   - 部署在各個實際產生負載的機器上。
   - 啟動後會主動向 Master 註冊，並等待 Master 派發任務。
   - 收到任務後，若為「仿真模式」，會自動啟動本地的 Proxy 伺服器，接著執行 k6 腳本進行壓測。
   - 壓測結束後，自動將產生的結果（summary）回傳給 Master。
4. **Simulation Proxy (加密代理伺服器)**
   - 用於模擬真實 Desktop App 客戶端的行為。
   - 自動向後端請求 RSA Public Key，並攔截註冊與登入請求，以 RSA 加密傳輸 AES Key。
   - 對所有後續的 API 請求與回應進行 AES-256-GCM 加解密處理，還原真實的 CPU 負載。
5. **k6 測試腳本 (`main.js`)**
   - 實際模擬單一考試使用者的行為流程。

---

## 參、 測試模式解析 (Test Modes)

系統支援兩種截然不同的測試模式，請依據測試目標進行選擇：

### 1. Pure Mode (單純測試 / 極限效能)
- **原理**：完全跳過後端與前端的 RSA / AES 加密與解密流程。k6 直接以明文 JSON 發送請求給受測的 Backend API。
- **目的**：旨在測試資料庫與後端核心業務邏輯的極限吞吐量（Throughput）。
- **優勢**：因為不需執行耗費 CPU 的加解密運算，單台機器可以開啟非常多的 Virtual Users (VUs)。
- **注意**：在此模式下，後端伺服器啟動時必須設定環境變數 `LOAD_TEST_MODE=pure` 以接收明文請求。

### 2. Simulation Mode (仿真測試 / 完整還原)
- **原理**：不跳過任何安全機制。Slave 在執行 k6 前，會在本地自動啟動 Simulation Proxy (Port 隨機)。k6 腳本會將明文請求發送給 Proxy，由 Proxy 進行 RSA 金鑰交換、設備自動註冊，並使用 AES-256-GCM 加密請求後，再轉發給真實的 Backend。
- **目的**：還原最真實的生產環境情境，連同「加密解密所造成的 CPU 與運算負載」一併測試。
- **優勢**：能找出系統在真實安全架構下的效能瓶頸。
- **注意**：由於 Node.js 與 Proxy 執行加密極度消耗 CPU 資源，單台機器能承受的併發量會顯著降低。後端伺服器啟動時必須設定環境變數 `LOAD_TEST_MODE=simulation`。

---

## 肆、 測試腳本行為流程 (User Flow)

當 k6 測試啟動後，每個虛擬使用者 (VU) 會嚴格遵循以下流程（定義於 `src/k6-scripts/main.js`）：

1. **認證與初始化**
   - 發送 `device_uuid` 與 `testId` 執行登入 (`/user/auth/login`)。
   - 取得 `session_token`，後續請求皆帶上 Authorization Bearer 標頭。
2. **獲取初始設定 (Module 1 開始)**
   - 請求 `/user/exam/config`。
3. **高頻互動區段 (迴圈執行 7 次)**
   - 上傳錯誤分數 (Score: 0) -> 寫入 Log (bad_score)。
   - 上傳錯誤程式碼 (`q1.c`, Code: bad code) -> 寫入 Log。
   - 上傳正確分數 (Score: 100) -> 寫入 Log。
   - 上傳正確程式碼 (`q2.c`, Code: good code) -> 寫入 Log。
   - *(每次迴圈間隔 0.5 秒，模擬人類操作停頓)*
4. **狀態檢查**
   - 請求 `/user/exam/messages` 檢查訊息。
   - 再次請求 `/user/exam/config` -> 寫入 Log (config)。
5. **大量交卷區段 (迴圈執行 5 次 / Module 2)**
   - 連續上傳兩份程式碼 (`q1.c`, `q2.c`)。
   - 上傳成績 (Score: 100)。
   - 寫入 Log (submit_all)。
   - *(每次迴圈間隔 0.5 秒)*
6. **結束測試**
   - 請求 `/user/exam/messages`。
   - 寫入結束 Log (finish)。

---

## 伍、 動態測試設定 (load-test.json)

在專案根目錄下的 `load-test.json` 可讓您完全自訂壓測的輪數與 API 請求次數。系統將會依照 JSON 檔內的設定，動態產生對應的 k6 scenario。

```json
{
  "execution": {
    "type": "iterations",
    "iterationsPerUser": 1,
    "duration": "10m"
  },
  "pureMode": {
    "configCallsPerIteration": 1,
    "messagesCallsPerIteration": 1,
    "scoreCallsPerIteration": 7,
    "logCallsPerIteration": 14,
    "codeCallsPerIteration": 7
  },
  "simulationMode": {
    "module1Loops": 7,
    "module2Loops": 5
  }
}
```

### 設定說明
1. **`execution` 區塊**:
   - `type`: 可設定為 `iterations` 或 `duration`。
   - `iterations`: 以執行次數為準，每位 User (`Thread Group`) 會完整執行腳本 `iterationsPerUser` 次。
   - `duration`: 以持續時間為準，在 `duration` 時間內 (例如 `10m`)，所有 User 會不斷循環執行。
2. **`pureMode` 區塊**: 
   - 設定每一次執行循環中，要打各個 API 的次數。這可讓您在不耗費加密運算下，測試指定 API 的極限負載。
3. **`simulationMode` 區塊**: 
   - 控制仿真模式下，模組一與模組二內部的迴圈執行次數。

---

## 陸、 詳細操作指南 (Step-by-Step Guide)

請在專案根目錄 (`k6-test`) 執行所有指令。所有操作都可以透過互動式選單進行：
```bash
npm run cli
```

### 第一步：產生測試資料 (Generate Seed)
在進行任何測試前，我們需要一批預先建置的假帳號。
1. 執行 `npm run cli`，選擇 `1. 產生測試帳號 (Generate Seed)`。
2. 輸入要產生的帳號數量（例如：10000）。
3. 指定輸出路徑（預設為 `./db-init-data.json`）。
4. **【重要】** 產生完畢後，您必須將這份 `db-init-data.json` 匯入至您的 Backend 資料庫中，以確保測試時帳號皆存在。

### 第二步：啟動 Master 節點 (Start Master)
找一台負責擔任總指揮的電腦（或終端機視窗）啟動 Master。
1. 執行 `npm run cli`，選擇 `2. 啟動 Master 節點 (Start Master)`。
2. 設定監聽 Port（預設 8080）。
3. 輸入剛產生的 `db-init-data.json` 路徑。
4. 選擇測試模式 (`Pure Mode` 或 `Simulation Mode`)。
5. 輸入受測後端 API 的真實網址（例如：`http://192.168.1.100:3000`）。
6. Master 啟動後會顯示 `Waiting for slaves to register...`。

### 第三步：啟動 Slave 節點 (Start Slave)
在負責產生負載的多台測試機上啟動 Slave。
1. 確保測試機有 Node.js 與 k6 環境，並已複製本專案程式碼。
2. 執行 `npm run cli`，選擇 `3. 啟動 Slave 節點 (Start Slave)`。
3. 輸入 Master 的 URL（例如：`http://<Master_IP>:8080`）。
4. 設定本地 Port（預設 8081）。
5. 啟動後，畫面會顯示成功向 Master 註冊。
*(此步驟可在多台實體機器上重複執行，越多台能產生越大的負載)*

### 第四步：發動測試 (Start Test)
1. 回到 Master 的終端機畫面。
2. 確認所有 Slave 都已連線（畫面上會顯示連線數量）。
3. **按下 `ENTER` 鍵**。
4. Master 會將 10000 個帳號平均切分（如 10 台 Slave 則每台分 1000 個），並發送 Start 訊號。
5. 各 Slave 收到訊號後會自動啟動 k6（若為仿真模式，還會自動喚起 Proxy）。
6. 測試完成後，Slave 會自動將報告傳回 Master，Master 最終會將資料彙整成一份總報告。

---

## 柒、 單機快速測試與除錯 (Local Test)

若您還在開發階段，不想架設繁雜的 Master-Slave 環境，系統提供了一鍵單機測試功能。

1. 執行 `npm run cli`，選擇 `4. 本地直接單測 (Local Test)`。
2. 提供 `db-init-data.json` 路徑。
3. 選擇 `Pure Mode` 或 `Simulation Mode`。
4. 輸入真實後端 API 網址。
5. 系統會在一台機器上直接幫您執行所有的流程（包含啟動 Proxy 與 k6），並產出 `summary.json` 與 HTML 報表。

**獨立啟動 Proxy**：
若您只想用 Postman 或瀏覽器測試加密流程，可選擇 `5. 啟動加密代理伺服器 (Start Proxy)`。Proxy 會攔截您的明文請求，加密後再轉發給 Backend。

---

## 捌、 報表與產出物

測試結束後，系統會生成以下檔案：
- **`summary.json`**: k6 產生的原始 JSON 效能數據報告。
- **`summary.html`**: 精美的視覺化 HTML 效能報表，可直接在瀏覽器開啟，查看各 API 的 P90/P95 延遲、HTTP 狀態碼分布與吞吐量圖表。

---

## 玖、 注意事項

1. **環境變數對齊**：在使用 `Pure Mode` 測試時，請務必確保後端伺服器有加上 `LOAD_TEST_MODE=pure` 環境變數，否則後端依然會嘗試解密明文資料導致 Crash。
2. **Proxy Port 衝突**：在 Slave 節點上，Simulation 模式會使用隨機 Port (4000 ~ 4999) 啟動 Proxy。若您在同一台機器上開啟多個 Slave，系統支援自動隨機分配，但請留意系統記憶體與 CPU 的消耗。
3. **k6 安裝**：所有 Slave 節點的作業系統必須預先安裝 `k6` (請參考 [k6 官方安裝指南](https://k6.io/docs/get-started/installation/))，否則將無法發動攻擊。
4. **網路防火牆**：確保 Master 與 Slave 之間的網路是互通的（特別是 Master 設定的 Port，以及 Slave 向 Master 發送報告的回傳網路）。
