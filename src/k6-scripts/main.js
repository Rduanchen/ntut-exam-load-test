import http from 'k6/http';
import { check, sleep } from 'k6';
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.1/index.js';
import { htmlReport } from "https://raw.githubusercontent.com/benc-uk/k6-reporter/main/dist/bundle.js";

// Read the config injected by the Slave Server
const rawConfig = __ENV.SLAVE_CONFIG_PATH ? open(__ENV.SLAVE_CONFIG_PATH) : null;
if (!rawConfig) {
    throw new Error('SLAVE_CONFIG_PATH environment variable is required');
}
const testConfig = JSON.parse(rawConfig);
const targetHost = testConfig.targetHost;
const mode = testConfig.mode; // 'pure' or 'simulation'
const users = testConfig.users;

// Open sample files
const q1File = open('../../samples/q1.c');
const q2File = open('../../samples/q2.c');
const samples = [q1File, q2File];

export const options = {
    scenarios: {
        load_test: {
            executor: 'per-vu-iterations',
            vus: users.length,
            iterations: 1, // the flow itself has internal loops
            maxDuration: '10m',
        },
    },
};

export default function () {
    // __VU is 1-indexed
    const userIndex = __VU - 1;
    if (userIndex >= users.length) return;
    
    const user = users[userIndex];
    const headers = {
        'x-test-fake-ip': user.ip,
        'Content-Type': 'application/json'
    };

    // 0. Login & Get Session
    const loginPayload = {
        device_uuid: user.deviceUuid,
        testId: user.testId
    };

    const loginRes = http.post(`${targetHost}/user/auth/login`, JSON.stringify(loginPayload), { headers });
    check(loginRes, { 'login success': (r) => r.status === 200 });

    const token = loginRes.json('session_token');
    const authHeaders = { ...headers, 'Authorization': `Bearer ${token}` };

    // ===== MODULE 1 =====
    
    // 1. Get Config
    const configPayload = { device_uuid: user.deviceUuid, testId: user.testId };
    const configRes = http.post(`${targetHost}/user/exam/config`, JSON.stringify(configPayload), { headers: authHeaders });
    check(configRes, { 'get config success': (r) => r.status === 200 });

    // 2. Loop 7 times
    for (let i = 0; i < 7; i++) {
        // Upload bad score
        let scorePayload = { device_uuid: user.deviceUuid, testId: user.testId, score: 0 };
        http.post(`${targetHost}/user/submissions/score`, JSON.stringify(scorePayload), { headers: authHeaders });
        
        // Log
        let logPayload = { device_uuid: user.deviceUuid, testId: user.testId, actionType: "bad_score" };
        http.post(`${targetHost}/user/log`, JSON.stringify(logPayload), { headers: authHeaders });

        // Upload bad file
        const codePayloadBad = { 
            device_uuid: user.deviceUuid, testId: user.testId,
            questionId: "q1", language: "C", codeContent: "bad code"
        };
        http.post(`${targetHost}/user/submissions/code`, JSON.stringify(codePayloadBad), { headers: authHeaders });

        // Log
        http.post(`${targetHost}/user/log`, JSON.stringify(logPayload), { headers: authHeaders });

        // Upload good score
        scorePayload.score = 100;
        http.post(`${targetHost}/user/submissions/score`, JSON.stringify(scorePayload), { headers: authHeaders });

        // Log
        http.post(`${targetHost}/user/log`, JSON.stringify(logPayload), { headers: authHeaders });

        // Upload good file
        const codePayloadGood = { 
            device_uuid: user.deviceUuid, testId: user.testId,
            questionId: "q2", language: "C", codeContent: "good code"
        };
        http.post(`${targetHost}/user/submissions/code`, JSON.stringify(codePayloadGood), { headers: authHeaders });

        // Log
        http.post(`${targetHost}/user/log`, JSON.stringify(logPayload), { headers: authHeaders });
        
        sleep(0.5); // Add a small sleep to simulate human processing time
    }

    // 3. Check message
    let msgPayload = { device_uuid: user.deviceUuid, testId: user.testId, lastMessageId: 0 };
    http.post(`${targetHost}/user/exam/messages`, JSON.stringify(msgPayload), { headers: authHeaders });

    // 4. Get Config again & Log
    http.post(`${targetHost}/user/exam/config`, JSON.stringify(configPayload), { headers: authHeaders });
    http.post(`${targetHost}/user/log`, JSON.stringify({ device_uuid: user.deviceUuid, testId: user.testId, actionType: "config" }), { headers: authHeaders });

    // ===== MODULE 2 =====
    
    // Loop 5 times
    for (let i = 0; i < 5; i++) {
        // Upload all files (mocking 2 files)
        const code1 = { device_uuid: user.deviceUuid, testId: user.testId, questionId: "q1", language: "C", codeContent: "some code" };
        const code2 = { device_uuid: user.deviceUuid, testId: user.testId, questionId: "q2", language: "C", codeContent: "some code" };
        http.post(`${targetHost}/user/submissions/code`, JSON.stringify(code1), { headers: authHeaders });
        http.post(`${targetHost}/user/submissions/code`, JSON.stringify(code2), { headers: authHeaders });

        // Upload score
        const scoreP = { device_uuid: user.deviceUuid, testId: user.testId, score: 100 };
        http.post(`${targetHost}/user/submissions/score`, JSON.stringify(scoreP), { headers: authHeaders });

        // Log
        http.post(`${targetHost}/user/log`, JSON.stringify({ device_uuid: user.deviceUuid, testId: user.testId, actionType: "submit_all" }), { headers: authHeaders });
        
        sleep(0.5);
    }

    // Check message & log
    http.post(`${targetHost}/user/exam/messages`, JSON.stringify(msgPayload), { headers: authHeaders });
    http.post(`${targetHost}/user/log`, JSON.stringify({ device_uuid: user.deviceUuid, testId: user.testId, actionType: "finish" }), { headers: authHeaders });
}

export function handleSummary(data) {
    const jsonPath = __ENV.K6_SUMMARY_JSON_PATH || "summary.json";
    const htmlPath = __ENV.K6_SUMMARY_HTML_PATH || "summary.html";
    return {
        [jsonPath]: JSON.stringify(data, null, 2),
        [htmlPath]: htmlReport(data),
        stdout: textSummary(data, { indent: ' ', enableColors: true }),
    };
}
