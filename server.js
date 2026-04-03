import express from "express";
import https from "node:https";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "10mb" }));
app.use(express.static(__dirname));

// --- Transparent Gateway (Bypass TLS/CORS) ---

// Handle Authentication
app.post("/api/auth", (req, res) => {
  const { host, username, password } = req.body;
  
  if (!host || !username || !password) {
    return res.status(400).json({ error: "Missing connection details" });
  }

  const authData = JSON.stringify({ credentials: { username, password } });
  
  const options = {
    hostname: host,
    port: 443,
    path: "/axapi/v3/auth",
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Content-Length": authData.length,
    },
    rejectUnauthorized: false, // --- Insecure -k behavior ---
  };

  const proxyReq = https.request(options, (proxyRes) => {
    let body = "";
    proxyRes.on("data", (chunk) => body += chunk);
    proxyRes.on("end", () => {
      try {
        const parsed = JSON.parse(body);
        res.status(proxyRes.statusCode).json(parsed);
      } catch (err) {
        res.status(500).json({ error: "Failed to parse A10 response" });
      }
    });
  });

  proxyReq.on("error", (err) => {
    res.status(500).json({ error: "Connection to Thunder failed: " + err.message });
  });

  proxyReq.write(authData);
  proxyReq.end();
});

// Handle Universal API Proxy
app.all("/api/proxy", (req, res) => {
  const targetHost = req.headers["x-target-host"];
  const targetPath = req.headers["x-target-path"];
  const authToken = req.headers["x-auth-token"];

  if (!targetHost || !targetPath) {
    return res.status(400).json({ error: "Missing target headers" });
  }

  const options = {
    hostname: targetHost,
    port: 443,
    path: targetPath + (req.url.includes("?") ? req.url.substring(req.url.indexOf("?")) : ""),
    method: req.method,
    headers: {
      ...req.headers,
      "host": targetHost,
      "Authorization": authToken ? `A10 ${authToken}` : undefined,
    },
    rejectUnauthorized: false, // --- Insecure -k behavior ---
  };

  // Clean up proxy headers to avoid loops or conflicts
  delete options.headers["x-target-host"];
  delete options.headers["x-target-path"];
  delete options.headers["x-auth-token"];
  delete options.headers["connection"];
  delete options.headers["content-length"];

  const proxyReq = https.request(options, (proxyRes) => {
    // Preserve response headers (like X-Auth-Expired)
    Object.keys(proxyRes.headers).forEach(key => {
      res.setHeader(key, proxyRes.headers[key]);
    });
    
    res.status(proxyRes.statusCode);
    proxyRes.pipe(res);
  });

  proxyReq.on("error", (err) => {
    res.status(500).json({ error: "Proxy connection failed: " + err.message });
  });

  if (["POST", "PUT", "PATCH"].includes(req.method)) {
    req.pipe(proxyReq);
  } else {
    proxyReq.end();
  }
});

if (process.env.NODE_ENV !== "test") {
  app.listen(PORT, () => {
    console.log(`aXAPI Documentation Explorer (Gateway Mode) running at http://localhost:${PORT}`);
  });
}

export { app };
