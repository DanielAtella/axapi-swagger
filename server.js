import express from "express";
import cors from "cors";
import https from "node:https";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({ exposedHeaders: ["X-Auth-Expired"] }));
app.use(express.json({ limit: "10mb" }));

// Session state (single-user portal)
const session = { host: null, token: null };

/**
 * Make an HTTPS request to a Thunder device (self-signed cert safe).
 */
function thunderRequest(host, path, method, headers, body) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: host,
      port: 443,
      path,
      method,
      headers: { "Content-Type": "application/json", ...headers },
      rejectUnauthorized: false,
      timeout: method === "POST" && path === "/axapi/v3/auth" ? 10000 : 30000,
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        let parsed;
        try {
          parsed = JSON.parse(data);
        } catch {
          parsed = data;
        }
        resolve({ status: res.statusCode, headers: res.headers, body: parsed });
      });
    });

    req.on("timeout", () => {
      req.destroy();
      reject(new Error("TIMEOUT"));
    });

    req.on("error", (err) => reject(err));

    if (body) {
      req.write(typeof body === "string" ? body : JSON.stringify(body));
    }
    req.end();
  });
}

// --- Auth Proxy ---
app.post("/api/auth", async (req, res) => {
  const { host, username, password } = req.body;
  if (!host || !username || !password) {
    return res.status(400).json({ error: "Missing required fields: host, username, password" });
  }

  try {
    const result = await thunderRequest(
      host,
      "/axapi/v3/auth",
      "POST",
      {},
      { credentials: { username, password } }
    );

    if (result.status !== 200 || !result.body?.authresponse?.signature) {
      session.host = null;
      session.token = null;
      const errMsg = result.body?.response?.err?.msg || "Authentication failed";
      return res.status(401).json({ error: errMsg });
    }

    session.host = host;
    session.token = result.body.authresponse.signature;
    return res.json({ token: session.token, host });
  } catch (err) {
    if (err.message === "TIMEOUT") {
      return res.status(504).json({ error: `Connection to ${host} timed out after 10 seconds` });
    }
    return res.status(504).json({ error: `Unable to reach ${host}: ${err.message}` });
  }
});

// --- API Proxy ---
app.post("/api/proxy", async (req, res) => {
  if (!session.token || !session.host) {
    return res.status(401).json({ error: "Not authenticated. Connect to a Thunder device first." });
  }

  const { method, path, body, headers } = req.body;
  if (!method || !path) {
    return res.status(400).json({ error: "Missing required fields: method, path" });
  }

  try {
    const reqHeaders = {
      "Authorization": `A10 ${session.token}`,
      ...(headers || {}),
    };

    const result = await thunderRequest(
      session.host,
      `/axapi/v3${path}`,
      method.toUpperCase(),
      reqHeaders,
      body || undefined
    );

    // 401 detection — add X-Auth-Expired header
    if (result.status === 401) {
      res.set("X-Auth-Expired", "true");
      session.token = null;
    }

    return res.status(result.status).json(result.body);
  } catch (err) {
    if (err.message === "TIMEOUT") {
      return res.status(502).json({ error: "Request to Thunder device timed out" });
    }
    return res.status(502).json({ error: `Unable to reach Thunder device: ${err.message}` });
  }
});

// --- Disconnect ---
app.post("/api/disconnect", (_req, res) => {
  session.host = null;
  session.token = null;
  return res.json({ status: "disconnected" });
});

// --- Session Status ---
app.get("/api/session", (_req, res) => {
  return res.json({
    connected: !!(session.host && session.token),
    host: session.host,
  });
});

// Static files (must be last)
app.use(express.static(__dirname));

if (process.env.NODE_ENV !== "test") {
  app.listen(PORT, () => {
    console.log(`aXAPI Swagger Explorer running at http://localhost:${PORT}`);
  });
}

export { app, session, thunderRequest };
