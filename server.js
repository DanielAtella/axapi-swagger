import express from "express";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json({ limit: "10mb" }));

// Static files (Documentation Portal)
app.use(express.static(__dirname));

/**
 * Note: All API orchestration (Auth & Proxy) has been migrated to Direct Mode.
 * Requests are now executed directly from the browser to the Thunder device IP.
 */

if (process.env.NODE_ENV !== "test") {
  app.listen(PORT, () => {
    console.log(`aXAPI Swagger Explorer (Direct Mode Only) running at http://localhost:${PORT}`);
  });
}

export { app };
