# --- Stage 1: Hermetic Dependency & Source Builder ---
# Standard image for fast, reliable npm install and source inclusion
FROM node:20-slim AS builder
WORKDIR /app

# 1. Install dependencies first (better layer caching)
COPY package.json package-lock.json* ./
RUN npm install --production

# 2. Copy the entire application source (including specs/ and manifest.json)
COPY . .

# --- Stage 2: Final Secure Production Gateway ---
# High-security Chainguard Node image
FROM cgr.dev/chainguard/node:latest
WORKDIR /app

# 3. Synchronously migrate EVERYTHING from the builder stage
# This ensures atomic asset availability (resolves missing specs/)
COPY --from=builder --chown=node:node /app /app

# Environment Configuration
ENV PORT=3000
ENV NODE_ENV=production

# Expose the Documentation Gateway
EXPOSE 3000

# Start the Explorer
CMD ["server.js"]