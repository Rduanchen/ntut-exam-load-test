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

const loadTestConfig = testConfig.loadTestConfig || {};
const execConfig = loadTestConfig.execution || { type: 'iterations', iterationsPerUser: 1, duration: '10m' };
const pureModeConfig = loadTestConfig.pureMode || {
    configCallsPerIteration: 1,
    messagesCallsPerIteration: 1,
    scoreCallsPerIteration: 7,
    logCallsPerIteration: 14,
    codeCallsPerIteration: 7
};
const simModeConfig = loadTestConfig.simulationMode || {
    module1Loops: 7,
    module2Loops: 5
};

// Setup K6 Options
let scenarioConfig = {
    executor: 'per-vu-iterations',
    vus: users.length,
    iterations: 1,
    maxDuration: '10m',
};

if (execConfig.type === 'duration') {
    scenarioConfig = {
        executor: 'constant-vus',
        vus: users.length,
        duration: execConfig.duration,
    };
} else {
    scenarioConfig = {
        executor: 'per-vu-iterations',
        vus: users.length,
        iterations: execConfig.iterationsPerUser || 1,
        maxDuration: execConfig.duration || '10m',
    };
}

export const options = {
    scenarios: {
        load_test: scenarioConfig,
    },
};

export default function () {
    const userIndex = __VU - 1;
    if (userIndex >= users.length) return;
    
    const user = users[userIndex];
    const headers = {
        'x-test-fake-ip': user.ip,
        'Content-Type': 'application/json'
    };

    // Login
    const loginPayload = { device_uuid: user.deviceUuid, testId: user.testId };
    const loginRes = http.post(`${targetHost}/user/auth/login`, JSON.stringify(loginPayload), { headers, tags: { name: 'Login API' } });
    check(loginRes, { 'Login API success': (r) => r.status === 200 });

    const token = loginRes.json('session_token');
    const authHeaders = { ...headers, 'Authorization': `Bearer ${token}` };

    if (mode === 'pure') {
        runPureMode(user, authHeaders);
    } else {
        runSimulationMode(user, authHeaders);
    }
}

function runPureMode(user, authHeaders) {
    const { configCallsPerIteration, messagesCallsPerIteration, scoreCallsPerIteration, logCallsPerIteration, codeCallsPerIteration } = pureModeConfig;
    
    // config
    const configPayload = { device_uuid: user.deviceUuid, testId: user.testId };
    for (let i = 0; i < configCallsPerIteration; i++) {
        let res = http.post(`${targetHost}/user/exam/config`, JSON.stringify(configPayload), { headers: authHeaders, tags: { name: 'Config API' } });
        check(res, { 'Config API success': (r) => r.status === 200 });
    }

    // messages
    const msgPayload = { device_uuid: user.deviceUuid, testId: user.testId, lastMessageId: 0 };
    for (let i = 0; i < messagesCallsPerIteration; i++) {
        let res = http.post(`${targetHost}/user/exam/messages`, JSON.stringify(msgPayload), { headers: authHeaders, tags: { name: 'Messages API' } });
        check(res, { 'Messages API success': (r) => r.status === 200 });
    }

    // score
    const scorePayload = { device_uuid: user.deviceUuid, testId: user.testId, score: 100 };
    for (let i = 0; i < scoreCallsPerIteration; i++) {
        let res = http.post(`${targetHost}/user/submissions/score`, JSON.stringify(scorePayload), { headers: authHeaders, tags: { name: 'Score API' } });
        check(res, { 'Score API success': (r) => r.status === 200 });
    }

    // log
    const logPayload = { device_uuid: user.deviceUuid, testId: user.testId, actionType: "pure_test" };
    for (let i = 0; i < logCallsPerIteration; i++) {
        let res = http.post(`${targetHost}/user/log`, JSON.stringify(logPayload), { headers: authHeaders, tags: { name: 'Log API' } });
        check(res, { 'Log API success': (r) => r.status === 200 });
    }

    // code
    const codePayload = { 
        device_uuid: user.deviceUuid, testId: user.testId,
        questionId: "q1", language: "C", codeContent: "pure test code"
    };
    for (let i = 0; i < codeCallsPerIteration; i++) {
        let res = http.post(`${targetHost}/user/submissions/code`, JSON.stringify(codePayload), { headers: authHeaders, tags: { name: 'Code API' } });
        check(res, { 'Code API success': (r) => r.status === 200 });
    }
}

function runSimulationMode(user, authHeaders) {
    const { module1Loops, module2Loops } = simModeConfig;
    const configPayload = { device_uuid: user.deviceUuid, testId: user.testId };

    // MODULE 1
    const configRes = http.post(`${targetHost}/user/exam/config`, JSON.stringify(configPayload), { headers: authHeaders, tags: { name: 'Config API' } });
    check(configRes, { 'Config API success': (r) => r.status === 200 });

    for (let i = 0; i < module1Loops; i++) {
        let scorePayload = { device_uuid: user.deviceUuid, testId: user.testId, score: 0 };
        let r1 = http.post(`${targetHost}/user/submissions/score`, JSON.stringify(scorePayload), { headers: authHeaders, tags: { name: 'Score API' } });
        check(r1, { 'Score API success': (r) => r.status === 200 });
        
        let logPayload = { device_uuid: user.deviceUuid, testId: user.testId, actionType: "bad_score" };
        let r2 = http.post(`${targetHost}/user/log`, JSON.stringify(logPayload), { headers: authHeaders, tags: { name: 'Log API' } });
        check(r2, { 'Log API success': (r) => r.status === 200 });

        const codePayloadBad = { device_uuid: user.deviceUuid, testId: user.testId, questionId: "q1", language: "C", codeContent: "bad code" };
        let r3 = http.post(`${targetHost}/user/submissions/code`, JSON.stringify(codePayloadBad), { headers: authHeaders, tags: { name: 'Code API' } });
        check(r3, { 'Code API success': (r) => r.status === 200 });

        let r4 = http.post(`${targetHost}/user/log`, JSON.stringify(logPayload), { headers: authHeaders, tags: { name: 'Log API' } });
        check(r4, { 'Log API success': (r) => r.status === 200 });

        scorePayload.score = 100;
        let r5 = http.post(`${targetHost}/user/submissions/score`, JSON.stringify(scorePayload), { headers: authHeaders, tags: { name: 'Score API' } });
        check(r5, { 'Score API success': (r) => r.status === 200 });
        
        let r6 = http.post(`${targetHost}/user/log`, JSON.stringify(logPayload), { headers: authHeaders, tags: { name: 'Log API' } });
        check(r6, { 'Log API success': (r) => r.status === 200 });

        const codePayloadGood = { device_uuid: user.deviceUuid, testId: user.testId, questionId: "q2", language: "C", codeContent: "good code" };
        let r7 = http.post(`${targetHost}/user/submissions/code`, JSON.stringify(codePayloadGood), { headers: authHeaders, tags: { name: 'Code API' } });
        check(r7, { 'Code API success': (r) => r.status === 200 });
        
        let r8 = http.post(`${targetHost}/user/log`, JSON.stringify(logPayload), { headers: authHeaders, tags: { name: 'Log API' } });
        check(r8, { 'Log API success': (r) => r.status === 200 });
        
        sleep(0.5);
    }

    let msgPayload = { device_uuid: user.deviceUuid, testId: user.testId, lastMessageId: 0 };
    let r9 = http.post(`${targetHost}/user/exam/messages`, JSON.stringify(msgPayload), { headers: authHeaders, tags: { name: 'Messages API' } });
    check(r9, { 'Messages API success': (r) => r.status === 200 });
    
    let r10 = http.post(`${targetHost}/user/exam/config`, JSON.stringify(configPayload), { headers: authHeaders, tags: { name: 'Config API' } });
    check(r10, { 'Config API success': (r) => r.status === 200 });
    
    let r11 = http.post(`${targetHost}/user/log`, JSON.stringify({ device_uuid: user.deviceUuid, testId: user.testId, actionType: "config" }), { headers: authHeaders, tags: { name: 'Log API' } });
    check(r11, { 'Log API success': (r) => r.status === 200 });

    // MODULE 2
    for (let i = 0; i < module2Loops; i++) {
        const code1 = { device_uuid: user.deviceUuid, testId: user.testId, questionId: "q1", language: "C", codeContent: "some code" };
        const code2 = { device_uuid: user.deviceUuid, testId: user.testId, questionId: "q2", language: "C", codeContent: "some code" };
        let r12 = http.post(`${targetHost}/user/submissions/code`, JSON.stringify(code1), { headers: authHeaders, tags: { name: 'Code API' } });
        check(r12, { 'Code API success': (r) => r.status === 200 });
        
        let r13 = http.post(`${targetHost}/user/submissions/code`, JSON.stringify(code2), { headers: authHeaders, tags: { name: 'Code API' } });
        check(r13, { 'Code API success': (r) => r.status === 200 });

        const scoreP = { device_uuid: user.deviceUuid, testId: user.testId, score: 100 };
        let r14 = http.post(`${targetHost}/user/submissions/score`, JSON.stringify(scoreP), { headers: authHeaders, tags: { name: 'Score API' } });
        check(r14, { 'Score API success': (r) => r.status === 200 });

        let r15 = http.post(`${targetHost}/user/log`, JSON.stringify({ device_uuid: user.deviceUuid, testId: user.testId, actionType: "submit_all" }), { headers: authHeaders, tags: { name: 'Log API' } });
        check(r15, { 'Log API success': (r) => r.status === 200 });
        
        sleep(0.5);
    }

    let r16 = http.post(`${targetHost}/user/exam/messages`, JSON.stringify(msgPayload), { headers: authHeaders, tags: { name: 'Messages API' } });
    check(r16, { 'Messages API success': (r) => r.status === 200 });
    
    let r17 = http.post(`${targetHost}/user/log`, JSON.stringify({ device_uuid: user.deviceUuid, testId: user.testId, actionType: "finish" }), { headers: authHeaders, tags: { name: 'Log API' } });
    check(r17, { 'Log API success': (r) => r.status === 200 });
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
