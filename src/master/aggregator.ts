import { K6SummaryReport } from '../types';
import chalk from 'chalk';
import * as fs from 'fs';

export function aggregateReports(reports: K6SummaryReport[]) {
  if (reports.length === 0) return;

  const total = {
    vus: 0,
    http_reqs: 0,
    http_req_failed: 0,
    iterations: 0,
  };

  let sumAvg = 0;
  let sumP90 = 0;
  let sumP95 = 0;

  reports.forEach(r => {
    total.vus += r.metrics?.vus?.values?.max || 0;
    total.http_reqs += r.metrics?.http_reqs?.values?.count || 0;
    total.http_req_failed += r.metrics?.http_req_failed?.values?.passes || 0; // passes means it failed the check
    total.iterations += r.metrics?.iterations?.values?.count || 0;

    // Weight the averages by request count
    const reqs = r.metrics.http_reqs?.values?.count || 1;
    sumAvg += (r.metrics.http_req_duration?.values?.avg || 0) * reqs;
    sumP90 += (r.metrics.http_req_duration?.values?.['p(90)'] || 0) * reqs;
    sumP95 += (r.metrics.http_req_duration?.values?.['p(95)'] || 0) * reqs;
  });

  const avgDuration = sumAvg / (total.http_reqs || 1);
  const p90Duration = sumP90 / (total.http_reqs || 1);
  const p95Duration = sumP95 / (total.http_reqs || 1);
  const errorRate = ((total.http_req_failed / (total.http_reqs || 1)) * 100).toFixed(2);

  const reportText = `
=============================================
         GLOBAL LOAD TEST SUMMARY
=============================================
Total VUs (Max)       : ${total.vus}
Total Iterations      : ${total.iterations}
Total HTTP Requests   : ${total.http_reqs}
Total Failed Requests : ${total.http_req_failed} (${errorRate}%)

--- Request Duration (Weighted Avg) ---
Average               : ${avgDuration.toFixed(2)} ms
P(90)                 : ${p90Duration.toFixed(2)} ms
P(95)                 : ${p95Duration.toFixed(2)} ms
=============================================
`;

  console.log(chalk.bold.green(reportText));
  fs.writeFileSync('global-summary.txt', reportText);
  // Force ts-node cache invalidation
  console.log(chalk.cyan('Saved summary to global-summary.txt'));
}
