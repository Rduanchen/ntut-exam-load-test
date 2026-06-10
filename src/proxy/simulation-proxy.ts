import express from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import axios from 'axios';

const app = express();
app.use(express.json());

interface TestUser {
  testId: string;
  ip: string;
  deviceUuid: string;
  aesKey: string;
}

let users: Map<string, TestUser> = new Map();
let sessionTokens: Map<string, string> = new Map();

// Configuration
const PROXY_PORT = process.env.PROXY_PORT || 4000;
const TARGET_HOST = process.env.TARGET_HOST || 'http://localhost:3000';
const SEED_FILE = process.env.SEED_FILE || path.resolve('./db-init-data.json');

// Load AES keys
function loadSeedData() {
    try {
        const data = JSON.parse(fs.readFileSync(SEED_FILE, 'utf-8'));
        const userList: TestUser[] = data.k6TestUsers || data.users || [];
        userList.forEach(u => {
            users.set(u.deviceUuid, u);
        });
        console.log(`[Proxy] Loaded ${users.size} users from seed file.`);
    } catch (e) {
        console.error(`[Proxy] Failed to load seed data from ${SEED_FILE}:`, e);
    }
}

function encryptAESGCM(plaintext: string, aesKeyHex: string) {
    const iv = crypto.randomBytes(12);
    const key = Buffer.from(aesKeyHex, 'hex');
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
    
    let ciphertext = cipher.update(plaintext, "utf8", "base64");
    ciphertext += cipher.final("base64");
    const tag = cipher.getAuthTag();
    
    return {
        iv: iv.toString("base64"),
        ciphertext,
        tag: tag.toString("base64"),
    };
}

function decryptAESGCM(ciphertext: string, ivBase64: string, tagBase64: string, aesKeyHex: string) {
    const key = Buffer.from(aesKeyHex, 'hex');
    const iv = Buffer.from(ivBase64, 'base64');
    const tag = Buffer.from(tagBase64, 'base64');
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    
    let decrypted = decipher.update(ciphertext, "base64", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
}

// Global Interceptor for all POST requests
const registeredUsers: Set<string> = new Set();
let rsaPublicKey: string | null = null;

async function getRsaPublicKey() {
    if (rsaPublicKey) return rsaPublicKey;
    const res = await axios.get(`${TARGET_HOST}/user/auth/rsa-public-key`);
    rsaPublicKey = res.data.publicKey;
    return rsaPublicKey;
}

app.post(/(.*)/, async (req, res) => {
    const { device_uuid, ...payloadData } = req.body;
    
    if (!device_uuid) {
        return res.status(400).json({ error: 'Missing device_uuid' });
    }

    const user = users.get(device_uuid);
    if (!user) {
        return res.status(401).json({ error: 'Unknown device_uuid' });
    }

    try {
        const targetUrl = `${TARGET_HOST}${req.originalUrl}`;
        const headers = { ...req.headers };
        delete headers.host;
        delete headers['content-length'];

        const isLogin = req.originalUrl.includes('/user/auth/login');

        // Auto-register device if not registered yet
        if (isLogin && !registeredUsers.has(device_uuid)) {
            const pubKey = await getRsaPublicKey();
            const encryptedAesKey = crypto.publicEncrypt(
                {
                    key: pubKey!,
                    padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
                    oaepHash: "sha256"
                },
                Buffer.from(user.aesKey, 'hex')
            ).toString('base64');

            try {
                await axios.post(`${TARGET_HOST}/user/auth/register-device`, {
                    device_uuid,
                    encrypted_aes_key: encryptedAesKey
                }, { headers });
                registeredUsers.add(device_uuid);
                console.log(`[Proxy] Auto-registered device ${device_uuid}`);
            } catch (regErr: any) {
                console.error(`[Proxy] Failed to auto-register device ${device_uuid}: ${regErr.message}`);
                // Proceed anyway, might already be registered
            }
        }
        
        let finalPayload: any = { ...payloadData };
        if (!isLogin) {
            const storedToken = sessionTokens.get(device_uuid);
            if (!storedToken) {
                console.error(`[Proxy] ❌ No session_token for device ${device_uuid} — login may have failed. Skipping ${req.originalUrl}`);
                return res.status(401).json({ error: 'No session token. Login failed or not yet completed.' });
            }
            finalPayload.session_token = storedToken;
            finalPayload.timestamp = Date.now();
            finalPayload.nonce = crypto.randomUUID();
        }

        const plaintext = JSON.stringify(finalPayload);
        const encrypted = encryptAESGCM(plaintext, user.aesKey);
        
        const requestBody = {
            device_uuid,
            iv: encrypted.iv,
            tag: encrypted.tag,
            ciphertext: encrypted.ciphertext
        };

        const backendRes = await axios.post(targetUrl, requestBody, {
            headers,
            validateStatus: () => true 
        });

        // Debug: log non-200 responses
        if (backendRes.status !== 200) {
            console.error(`[Proxy] ${req.originalUrl} -> ${backendRes.status}:`, JSON.stringify(backendRes.data).substring(0, 300));
        }

        if (isLogin && backendRes.status === 200 && backendRes.data.session_token) {
            sessionTokens.set(device_uuid, backendRes.data.session_token);
            console.log(`[Proxy] ✅ Login OK for device ${device_uuid.substring(0, 8)}... token stored.`);
            return res.status(200).json({ session_token: backendRes.data.session_token });
        }

        if (isLogin && backendRes.status !== 200) {
            console.error(`[Proxy] ❌ Login FAILED for device ${device_uuid}: ${backendRes.status} ${JSON.stringify(backendRes.data).substring(0, 200)}`);
        }

        if (backendRes.status === 200 && backendRes.data && backendRes.data.ciphertext) {
            try {
                const dec = decryptAESGCM(backendRes.data.ciphertext, backendRes.data.iv, backendRes.data.tag, user.aesKey);
                return res.status(backendRes.status).send(dec);
            } catch (decErr) {
                console.error('[Proxy] Decryption error:', decErr);
                return res.status(500).json({ error: 'Proxy Decryption Error' });
            }
        }

        return res.status(backendRes.status).json(backendRes.data);

    } catch (error: any) {
        console.error('[Proxy] Forwarding error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

loadSeedData();

app.listen(PROXY_PORT, () => {
    console.log(`[Simulation Proxy] Listening on port ${PROXY_PORT}`);
    console.log(`[Simulation Proxy] Forwarding to ${TARGET_HOST}`);
});
