import express from 'express';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import chalk from 'chalk';
import * as readline from 'readline';
import { MasterConfigPayload, SlaveRegistration, TestUser, K6SummaryReport } from '../types';
import { aggregateReports } from './aggregator';

export function startMaster(port: number, configPath: string, mode: 'pure' | 'simulation', targetHost: string, loadTestConfig: any) {
  const app = express();
  app.use(express.json({ limit: '50mb' }));

  // Load Seed Data
  const seedData = JSON.parse(fs.readFileSync(path.resolve(configPath), 'utf-8'));
  const totalUsers: TestUser[] = seedData.k6TestUsers || seedData.users;
  
  let registeredSlaves: SlaveRegistration[] = [];
  let reports: K6SummaryReport[] = [];

  console.log(chalk.cyan(`[Master] Loaded ${totalUsers.length} users from config.`));

  // 1. Slave Registration Endpoint
  app.post('/register', (req, res) => {
    const { slaveId, host } = req.body as SlaveRegistration;
    if (!registeredSlaves.find(s => s.slaveId === slaveId)) {
      registeredSlaves.push({ slaveId, host });
      console.log(chalk.green(`[Master] Slave connected: ${slaveId} (${host})`));
      console.log(chalk.gray(`Total registered slaves: ${registeredSlaves.length}`));
    }
    res.status(200).send('OK');
  });

  // 2. Report Collection Endpoint
  app.post('/report', (req, res) => {
    const { slaveId, report } = req.body;
    reports.push(report as K6SummaryReport);
    console.log(chalk.yellow(`[Master] Received report from ${slaveId}. (${reports.length}/${registeredSlaves.length})`));
    
    res.status(200).send('OK');

    if (reports.length === registeredSlaves.length) {
      console.log(chalk.green(`[Master] All reports received. Aggregating...`));
      aggregateReports(reports);
      setTimeout(() => process.exit(0), 1000);
    }
  });

  app.listen(port, () => {
    console.log(chalk.cyan(`[Master] Server listening on port ${port}`));
    console.log(chalk.magenta(`[Master] Waiting for slaves to register...`));
    console.log(chalk.magenta(`[Master] Press ENTER to distribute config and START the test.`));

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    rl.on('line', async () => {
      if (registeredSlaves.length === 0) {
        console.log(chalk.red(`[Master] No slaves registered yet.`));
        return;
      }
      
      console.log(chalk.cyan(`[Master] Preparing to start test on ${registeredSlaves.length} slaves...`));
      
      // Calculate chunks
      const chunkSize = Math.ceil(totalUsers.length / registeredSlaves.length);
      
      const promises = registeredSlaves.map((slave, index) => {
        const startIdx = index * chunkSize;
        const assignedUsers = totalUsers.slice(startIdx, startIdx + chunkSize);
        
        const payload: MasterConfigPayload = {
          slaveId: slave.slaveId,
          mode,
          targetHost,
          users: assignedUsers,
          loadTestConfig
        };

        return axios.post(`${slave.host}/start`, payload)
          .then(() => console.log(chalk.green(`[Master] Started slave ${slave.slaveId} with ${assignedUsers.length} users.`)))
          .catch(err => console.log(chalk.red(`[Master] Failed to start slave ${slave.slaveId}: ${err.message}`)));
      });

      await Promise.all(promises);
      console.log(chalk.cyan(`[Master] All start signals sent. Waiting for reports...`));
      rl.close();
    });
  });
}
