# A10 aXAPI Documentation Explorer (Gateway Mode)

A streamlined, high-performance Swagger portal for exploring A10 Thunder aXAPI v3 endpoints. It features a **Transparent Gateway** that eliminates common browser-side connectivity barriers like self-signed certificate warnings (TLS) and Cross-Origin Resource Sharing (CORS) blocks.

## 🚀 Key Features

-   **Zero-Manual Bypass**: No more manual certificate acceptance or IP tab switching.
-   **Native Fetch**: All API calls from the browser are routed through a secure, same-origin bridge (`server.js`).
-   **OAS 3.0 Ready**: Pre-indexed and categorized support for all A10 vThunder capabilities.
-   **Clean UI**: Minimalist connection bar (Host, User, Pass) with real-time status indicators.

## 🛠️ Getting Started

### Prerequisites

-   Node.js (v18+) or Docker.
-   Access to an A10 Thunder device with aXAPI v3 enabled.

### Quick Start (Local)

1.  **Install dependencies**:
    ```bash
    npm install
    ```

2.  **Start the Documentation Gateway**:
    ```bash
    npm start
    ```

3.  **Access the Explorer**:
    Open [http://localhost:3000](http://localhost:3000) in your browser.

## 🐳 Docker Deployment

To run the explorer in a secure, containerized environment:

### Build the Image
```bash
docker build -t axapi-explorer .
```

### Run the Container
```bash
docker run -p 3000:3000 --name axapi-doc-explorer axapi-explorer
```

## 🔐 Technical Architecture

The portal utilizes a **Transparent Bridge** architecture:
- **Gateway Server**: A lightweight Express back-end serves static files and acts as a CORS-satisfied relay.
- **TLS Bypass**: The gateway ignores certificate verification (`rejectUnauthorized: false`), acting as the CLI equivalent of `curl -k`.
- **Interceptors**: Swagger UI uses custom `requestInterceptors` to automatically route all `/axapi/v3/` calls through the `/api/proxy` endpoint.

---
© 2026 Omnis Tools. Optimized for A10 Thunder v5.x and v6.x.
