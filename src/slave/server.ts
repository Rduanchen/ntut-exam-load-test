import express from 'express';
import axios from 'axios';
import chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { v4 as uuidv4 } from 'uuid';
import { MasterConfigPayload, K6SummaryReport } from '../types';

export function startSlave(masterUrl: string, port: number) {
  const app = express();
  app.use(express.json({ limit: '50mb' }));

  const slaveId = `slave-${uuidv4().substring(0, 8)}`;
  const localHost = `http://localhost:${port}`;

  // Use unique file names per slave to avoid race conditions when
  // multiple slaves run on the same machine
  const configPath = path.resolve(__dirname, '..', '..', `slave-config-${slaveId}.json`);
  const summaryJsonPath = path.resolve(__dirname, '..', '..', `summary-${slaveId}.json`);
  const summaryHtmlPath = path.resolve(__dirname, '..', '..', `summary-${slaveId}.html`);

  app.post('/start', (req, res) => {
    const payload = req.body as MasterConfigPayload;
    const originalTargetHost = payload.targetHost;
    console.log(chalk.green(`[Slave ${slaveId}] Received start signal! Mode: ${payload.mode}, Target: ${payload.targetHost}, Users: ${payload.users.length}`));

    let proxyProcess: any = null;

    if (payload.mode === 'simulation') {
      const proxyPort = 4000 + Math.floor(Math.random() * 1000);
      
      // Overwrite payload's targetHost for the k6 script to point to local proxy
      payload.targetHost = `http://localhost:${proxyPort}`;

      // Write config BEFORE starting proxy so SEED_FILE points to valid JSON
      fs.writeFileSync(configPath, JSON.stringify(payload, null, 2));

      const proxyEnv = { 
        ...process.env, 
        PROXY_PORT: proxyPort.toString(), 
        TARGET_HOST: originalTargetHost, // use original backend URL, not the proxy one
        SEED_FILE: configPath
      };

      console.log(chalk.cyan(`[Slave ${slaveId}] [Auto-Proxy] Starting Proxy on Port ${proxyPort} -> forwarding to ${originalTargetHost}...`));
      proxyProcess = exec(`npx ts-node src/proxy/simulation-proxy.ts`, { env: proxyEnv, cwd: path.resolve(__dirname, '..', '..') });
      proxyProcess.stdout?.pipe(process.stdout);
      proxyProcess.stderr?.pipe(process.stderr);
    } else {
      fs.writeFileSync(configPath, JSON.stringify(payload, null, 2));
    }

    // Respond OK immediately so master isn't blocked
    res.status(200).send('OK');

    // Execute k6
    const scriptPath = path.resolve(__dirname, '..', 'k6-scripts', 'main.js');
    console.log(chalk.cyan(`[Slave ${slaveId}] Executing k6...`));
    
    const env = {
      ...process.env,
      SLAVE_CONFIG_PATH: configPath,
      K6_SUMMARY_JSON_PATH: summaryJsonPath,
      K6_SUMMARY_HTML_PATH: summaryHtmlPath,
    };

    const k6Command = `k6 run ${scriptPath}`;

    // Give the proxy time to start if it was launched
    const delay = proxyProcess ? 2000 : 0;
    setTimeout(() => {
      exec(k6Command, { env, cwd: path.resolve(__dirname, '..', '..') }, (error, stdout, stderr) => {
        if (proxyProcess) {
          console.log(chalk.yellow(`[Slave ${slaveId}] [Auto-Proxy] Shutting down proxy server...`));
          proxyProcess.kill();
        }
        
        console.log(chalk.gray(stdout));
        if (error) {
          console.error(chalk.red(`[Slave ${slaveId}] k6 execution error: ${error.message}`));
        }
        if (stderr) {
          console.error(chalk.red(`[Slave ${slaveId}] k6 stderr: ${stderr}`));
        }

        console.log(chalk.yellow(`[Slave ${slaveId}] k6 finished. Sending report to master...`));
        
        try {
          const summaryData = JSON.parse(fs.readFileSync(summaryJsonPath, 'utf-8'));
          
          axios.post(`${masterUrl}/report`, {
            slaveId,
            report: summaryData
          }).then(() => {
            console.log(chalk.green(`[Slave ${slaveId}] Report sent successfully.`));
            // Cleanup temp files
            try { fs.unlinkSync(configPath); } catch {}
            try { fs.unlinkSync(summaryJsonPath); } catch {}
          }).catch((err: any) => {
            console.error(chalk.red(`[Slave ${slaveId}] Failed to send report: ${err.message}`));
          });
        } catch (err: any) {
          console.error(chalk.red(`[Slave ${slaveId}] Failed to read summary: ${err.message}`));
        }
      });
    }, delay);
  });

  app.listen(port, () => {
    console.log(chalk.cyan(`[Slave ${slaveId}] Server listening on port ${port}`));
    
    // Auto register
    axios.post(`${masterUrl}/register`, { slaveId, host: localHost })
      .then(() => {
        console.log(chalk.green(`[Slave ${slaveId}] Successfully registered to Master ${masterUrl}`));
      })
      .catch((err) => {
        console.log(chalk.red(`[Slave ${slaveId}] Failed to register to Master: ${err.message}`));
        process.exit(1);
      });
  });
}
