#!/usr/bin/env node
import inquirer from 'inquirer';
import chalk from 'chalk';
import { generateSeed } from './generator';
import { startMaster } from '../master/server';
import { startSlave } from '../slave/server';
import * as path from 'path';
import { exec } from 'child_process';
import * as fs from 'fs';

async function main() {
  console.log(chalk.cyan.bold('\n=== K6-Test Distributed Load Testing CLI ===\n'));

  const { action } = await inquirer.prompt([
    {
      type: 'list',
      name: 'action',
      message: '請問您要執行什麼操作？',
      choices: [
        { name: '1. 產生測試帳號 (Generate Seed)', value: 'generate-seed' },
        { name: '2. 啟動 Master 節點 (Start Master)', value: 'start-master' },
        { name: '3. 啟動 Slave 節點 (Start Slave)', value: 'start-slave' },
        { name: '4. 本地直接單測 (Local Test)', value: 'local-test' },
        { name: '5. 啟動加密代理伺服器 (Start Simulation Proxy)', value: 'start-proxy' },
        { name: '0. 離開 (Exit)', value: 'exit' },
      ],
    },
  ]);

  if (action === 'exit') {
    process.exit(0);
  }

  if (action === 'generate-seed') {
    const answers = await inquirer.prompt([
      {
        type: 'number',
        name: 'count',
        message: '請問要產生多少個假帳號？',
        default: 10000,
      },
      {
        type: 'input',
        name: 'output',
        message: '請輸入輸出的 JSON 檔案路徑：',
        default: './db-init-data.json',
      },
    ]);
    generateSeed(answers.count, answers.output);
  } else if (action === 'start-master') {
    const answers = await inquirer.prompt([
      {
        type: 'number',
        name: 'port',
        message: 'Master 要監聽的 Port 號？',
        default: 8080,
      },
      {
        type: 'input',
        name: 'config',
        message: '請輸入初始化產生的資料庫 JSON 檔案路徑：',
        default: './db-init-data.json',
      },
      {
        type: 'list',
        name: 'mode',
        message: '請選擇壓測模式：',
        choices: [
          { name: 'Pure Mode (跳過加密，極限效能)', value: 'pure' },
          { name: 'Simulation Mode (透過 Proxy 模擬加解密)', value: 'simulation' },
        ],
      },
      {
        type: 'input',
        name: 'target',
        message: '受測的 Backend API URL (若 Simulation Mode 請填 Proxy 網址, e.g. http://localhost:4000)：',
        default: 'http://localhost:3000',
      },
    ]);
    let loadTestConfig: any;
    try {
      loadTestConfig = JSON.parse(fs.readFileSync(path.resolve('./load-test.json'), 'utf-8'));
    } catch (e) {
      console.error(chalk.yellow(`[Warning] No load-test.json found in root, using defaults.`));
      loadTestConfig = {};
    }
    startMaster(answers.port, answers.config, answers.mode as 'pure' | 'simulation', answers.target, loadTestConfig);
  } else if (action === 'start-slave') {
    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'master',
        message: 'Master 伺服器的 URL？',
        default: 'http://localhost:8080',
      },
      {
        type: 'number',
        name: 'port',
        message: '這台 Slave 要開在哪個 Port？',
        default: 8081,
      },
    ]);
    startSlave(answers.master, answers.port);
  } else if (action === 'start-proxy') {
    const answers = await inquirer.prompt([
      {
        type: 'number',
        name: 'port',
        message: 'Proxy 伺服器要監聽的 Port 號？',
        default: 4000,
      },
      {
        type: 'input',
        name: 'target',
        message: '實際受測的真實 Backend API URL：',
        default: 'http://localhost:3000',
      },
      {
        type: 'input',
        name: 'config',
        message: '請輸入初始化產生的 JSON 檔案路徑 (用來讀取 AES Key)：',
        default: './db-init-data.json',
      },
    ]);

    const env = { 
      ...process.env, 
      PROXY_PORT: answers.port.toString(), 
      TARGET_HOST: answers.target,
      SEED_FILE: path.resolve(answers.config)
    };

    console.log(chalk.cyan(`\nStarting Proxy Server on Port ${answers.port} -> forwarding to ${answers.target}...`));
    const child = exec(`npx ts-node src/proxy/simulation-proxy.ts`, { env, cwd: path.resolve(__dirname, '..', '..') });
    child.stdout?.pipe(process.stdout);
    child.stderr?.pipe(process.stderr);

  } else if (action === 'local-test') {
    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'config',
        message: '請輸入初始化產生的 JSON 檔案路徑 (用來讀取測試帳號)：',
        default: './db-init-data.json',
      },
      {
        type: 'list',
        name: 'mode',
        message: '請選擇壓測模式：',
        choices: [
          { name: 'Pure Mode', value: 'pure' },
          { name: 'Simulation Mode (透過 Proxy)', value: 'simulation' },
        ],
      },
      {
        type: 'input',
        name: 'backendUrl',
        message: '實際受測的真實 Backend API URL：',
        default: 'http://localhost:3000',
      },
    ]);

    // Load users from seed
    let seedData: any = { k6TestUsers: [] };
    try {
      seedData = JSON.parse(fs.readFileSync(path.resolve(answers.config), 'utf-8'));
    } catch (e) {
      console.error(chalk.red(`Failed to read seed file at ${answers.config}`));
      process.exit(1);
    }

    const totalUsers = seedData.k6TestUsers || seedData.users || [];
    if (totalUsers.length === 0) {
       console.error(chalk.red(`No users found in seed file!`));
       process.exit(1);
    }

    const testUsers = totalUsers;
    console.log(chalk.green(`\n[Info] Successfully loaded ${testUsers.length} users from config file.`));
    
    let targetHost = answers.backendUrl;
    let proxyProcess: any = null;

    if (answers.mode === 'simulation') {
      const proxyPort = 4000;
      targetHost = `http://localhost:${proxyPort}`;
      
      const proxyEnv = { 
        ...process.env, 
        PROXY_PORT: proxyPort.toString(), 
        TARGET_HOST: answers.backendUrl,
        SEED_FILE: path.resolve(answers.config)
      };

      console.log(chalk.cyan(`\n[Auto-Proxy] Starting Proxy Server on Port ${proxyPort} -> forwarding to ${answers.backendUrl}...`));
      proxyProcess = exec(`npx ts-node src/proxy/simulation-proxy.ts`, { env: proxyEnv, cwd: path.resolve(__dirname, '..', '..') });
      proxyProcess.stdout?.pipe(process.stdout);
      proxyProcess.stderr?.pipe(process.stderr);

      // wait a bit for proxy to start
      await new Promise(r => setTimeout(r, 2000));
    }

    let loadTestConfig: any;
    try {
      loadTestConfig = JSON.parse(fs.readFileSync(path.resolve('./load-test.json'), 'utf-8'));
    } catch (e) {
      console.error(chalk.yellow(`[Warning] No load-test.json found in root, using defaults.`));
      loadTestConfig = {};
    }

    const payload = {
      mode: answers.mode,
      targetHost: targetHost,
      users: testUsers,
      loadTestConfig
    };

    const configPath = path.resolve(__dirname, '..', '..', 'slave-config.json');
    fs.writeFileSync(configPath, JSON.stringify(payload, null, 2));

    const scriptPath = path.resolve(__dirname, '..', 'k6-scripts', 'main.js');
    const env = { ...process.env, SLAVE_CONFIG_PATH: configPath };
    console.log(chalk.cyan(`\nExecuting: k6 run ${scriptPath}`));

    const child = exec(`k6 run ${scriptPath}`, { env, cwd: path.resolve(__dirname, '..', '..') });
    child.stdout?.pipe(process.stdout);
    child.stderr?.pipe(process.stderr);

    child.on('close', () => {
      if (proxyProcess) {
        console.log(chalk.yellow(`\n[Auto-Proxy] Shutting down proxy server...`));
        proxyProcess.kill();
      }
    });
  }
}

main().catch((err) => {
  console.error(chalk.red(err.message));
  process.exit(1);
});
