# K6-Test Master-Slave 壓測架構使用手冊

這是一個為本地多機環境量身打造的 k6 分散式壓力測試系統。它解決了帳號碰撞問題，並支援「單純測試」(極限吞吐量) 與「仿真測試」(還原加密流程) 兩種模式。

## 系統模式說明

### 1. 單純測試 (Pure Mode)
* **特色**：跳過後端的 RSA 與 AES 加解密流程，k6 腳本直接以明文 JSON 傳遞，能達到**單機最高的併發量**。
* **適用情境**：想測出資料庫或核心業務邏輯的極限效能。
* **後端設定**：啟動後端時必須加上環境變數 `LOAD_TEST_MODE=pure`。
  ```bash
  LOAD_TEST_MODE=pure pnpm run start
  ```

### 2. 仿真測試 (Simulation Mode)
* **特色**：不跳過加密，完全模擬 Desktop App 啟動時的 RSA 金鑰交換與後續的 AES 加密請求。
* **適用情境**：需要連同「加解密負載」一起測試的真實還原情境。由於 JavaScript 執行加密運算極耗 CPU，單機無法開啟太多 Virtual Users (VU)。
* **後端設定**：啟動後端時必須加上環境變數 `LOAD_TEST_MODE=simulation`。
  ```bash
  LOAD_TEST_MODE=simulation pnpm run start
  ```

---

## 指令列操作 (CLI) 說明

請在 `k6-test` 資料夾下使用以下指令：

### 1. 初始化測試資料
由 Master 產生包含 10,000 個帳號與相關設定的初始設定檔，請將產生的 `db-init-data.json` 手動匯入至您的資料庫。
```bash
npm run cli generate-seed --count 10000 --output ./db-init-data.json
```

### 2. 啟動 Master 節點
在一台電腦上啟動中控台，負責分配帳號與收集報表。
```bash
npm run cli start-master --port 8080 --config ./db-init-data.json --mode pure
```
* `--mode` 可選 `pure` 或 `simulation`，它會通知所有連上的 Slave 切換對應的 k6 腳本邏輯。

### 3. 啟動 Slave 節點
在您的 10 台測試電腦上，分別執行以下指令來連上 Master 並準備發動攻擊。
```bash
npm run cli start-slave --master http://<Master的IP>:8080
```
*(啟動後，Slave 會自動向 Master 註冊，並等待 Master 發出 `start` 指令)*

### 4. 單機本地測試 (Local Test)
如果不想架設 Master-Slave，只想在一台電腦上快速測試腳本是否正常：
```bash
npm run cli local-test --mode pure --users 10
```

---

## 測試腳本行為 (Module 流程)

當測試開始時，k6 會自動依序執行以下流程：
1. **初始化**：取得設定檔，如果是仿真模式則進行 RSA/AES 握手。
2. **區段一 (執行 7 次)**：
   * 上傳錯誤答案檔案與成績 -> 寫入 Log。
   * 上傳正確答案檔案與成績 -> 寫入 Log。
3. **檢查**：檢查 Message -> 重新取得 Config。
4. **區段二 (執行 5 次)**：
   * 上傳所有檔案 -> 上傳成績 -> 寫入 Log。
5. **結束**：產出 `summary.json`。
