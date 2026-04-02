import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import https from "node:https";
import { EventEmitter } from "node:events";

// We need to mock https before importing the server
vi.mock("node:https", () => {
  return {
    default: {
      request: vi.fn(),
    },
  };
});

const { app, session } = await import("../server.js");

// Supertest-like helper using native fetch (since Express 5 returns promises)
import { createServer } from "node:http";

let server: ReturnType<typeof createServer>;
let baseUrl: string;

beforeEach(async () => {
  session.host = null;
  session.token = null;
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => {
      const addr = server.address();
      baseUrl = `http://localhost:${typeof addr === "object" ? addr?.port : addr}`;
      resolve();
    });
  });
});

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

function mockThunderResponse(statusCode: number, body: any) {
  const mockRes = new EventEmitter();
  (mockRes as any).statusCode = statusCode;
  (mockRes as any).headers = {};

  const mockReq = new EventEmitter();
  (mockReq as any).write = vi.fn();
  (mockReq as any).end = vi.fn();
  (mockReq as any).destroy = vi.fn();

  vi.mocked(https.request).mockImplementation((_opts: any, callback: any) => {
    setTimeout(() => {
      callback(mockRes);
      mockRes.emit("data", JSON.stringify(body));
      mockRes.emit("end");
    }, 0);
    return mockReq as any;
  });
}

function mockThunderError(error: Error) {
  const mockReq = new EventEmitter();
  (mockReq as any).write = vi.fn();
  (mockReq as any).end = vi.fn();
  (mockReq as any).destroy = vi.fn();

  vi.mocked(https.request).mockImplementation(() => {
    setTimeout(() => mockReq.emit("error", error), 0);
    return mockReq as any;
  });
}

function mockThunderTimeout() {
  const mockReq = new EventEmitter();
  (mockReq as any).write = vi.fn();
  (mockReq as any).end = vi.fn();
  (mockReq as any).destroy = vi.fn();

  vi.mocked(https.request).mockImplementation(() => {
    setTimeout(() => mockReq.emit("timeout"), 0);
    return mockReq as any;
  });
}

describe("POST /api/auth", () => {
  it("returns token on valid credentials", async () => {
    mockThunderResponse(200, { authresponse: { signature: "test-token-123" } });

    const res = await fetch(`${baseUrl}/api/auth`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ host: "10.0.0.1", username: "admin", password: "secret" }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.token).toBe("test-token-123");
    expect(data.host).toBe("10.0.0.1");
    expect(session.token).toBe("test-token-123");
    expect(session.host).toBe("10.0.0.1");
  });

  it("returns 401 on invalid credentials", async () => {
    mockThunderResponse(401, { response: { err: { msg: "Invalid username or password" } } });

    const res = await fetch(`${baseUrl}/api/auth`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ host: "10.0.0.1", username: "admin", password: "wrong" }),
    });

    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe("Invalid username or password");
    expect(session.token).toBeNull();
  });

  it("returns 504 on unreachable host (timeout)", async () => {
    mockThunderTimeout();

    const res = await fetch(`${baseUrl}/api/auth`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ host: "10.0.0.99", username: "admin", password: "secret" }),
    });

    expect(res.status).toBe(504);
    const data = await res.json();
    expect(data.error).toContain("timed out");
  });

  it("returns 504 on connection error", async () => {
    mockThunderError(new Error("ECONNREFUSED"));

    const res = await fetch(`${baseUrl}/api/auth`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ host: "10.0.0.99", username: "admin", password: "secret" }),
    });

    expect(res.status).toBe(504);
    const data = await res.json();
    expect(data.error).toContain("ECONNREFUSED");
  });

  it("returns 400 when host is missing", async () => {
    const res = await fetch(`${baseUrl}/api/auth`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "admin", password: "secret" }),
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("Missing required fields");
  });

  it("returns 400 when username is missing", async () => {
    const res = await fetch(`${baseUrl}/api/auth`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ host: "10.0.0.1", password: "secret" }),
    });

    expect(res.status).toBe(400);
  });

  it("returns 400 when password is missing", async () => {
    const res = await fetch(`${baseUrl}/api/auth`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ host: "10.0.0.1", username: "admin" }),
    });

    expect(res.status).toBe(400);
  });
});
