import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import https from "node:https";
import { EventEmitter } from "node:events";

vi.mock("node:https", () => {
  return {
    default: {
      request: vi.fn(),
    },
  };
});

const { app, session } = await import("../server.js");
import { createServer } from "node:http";

let server: ReturnType<typeof createServer>;
let baseUrl: string;

beforeEach(async () => {
  session.host = "10.0.0.1";
  session.token = "valid-token";
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
  (mockRes as any).headers = { "content-type": "application/json" };

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

describe("POST /api/proxy", () => {
  it("forwards GET request and returns Thunder response", async () => {
    const thunderBody = { "virtual-server-list": [{ name: "vs1" }] };
    mockThunderResponse(200, thunderBody);

    const res = await fetch(`${baseUrl}/api/proxy`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ method: "GET", path: "/slb/virtual-server" }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual(thunderBody);

    // Verify the request was made with correct auth header
    const callArgs = vi.mocked(https.request).mock.calls[0][0];
    expect(callArgs.headers["Authorization"]).toBe("A10 valid-token");
    expect(callArgs.path).toBe("/axapi/v3/slb/virtual-server");
    expect(callArgs.method).toBe("GET");
  });

  it("forwards POST with JSON body and returns Thunder response", async () => {
    const thunderBody = { response: { status: "OK" } };
    mockThunderResponse(200, thunderBody);

    const res = await fetch(`${baseUrl}/api/proxy`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        method: "POST",
        path: "/slb/virtual-server",
        body: { "virtual-server": { name: "vs1", "ip-address": "10.0.0.50" } },
      }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual(thunderBody);
  });

  it("returns 401 when no auth token is set", async () => {
    session.token = null;
    session.host = null;

    const res = await fetch(`${baseUrl}/api/proxy`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ method: "GET", path: "/slb/virtual-server" }),
    });

    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toContain("Not authenticated");
  });

  it("returns 502 when Thunder device is unreachable", async () => {
    mockThunderTimeout();

    const res = await fetch(`${baseUrl}/api/proxy`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ method: "GET", path: "/slb/virtual-server" }),
    });

    expect(res.status).toBe(502);
    const data = await res.json();
    expect(data.error).toContain("timed out");
  });

  it("passes through 5xx errors from Thunder as-is", async () => {
    const thunderBody = { response: { err: { msg: "Internal error" } } };
    mockThunderResponse(500, thunderBody);

    const res = await fetch(`${baseUrl}/api/proxy`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ method: "GET", path: "/slb/virtual-server" }),
    });

    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data).toEqual(thunderBody);
  });

  it("adds X-Auth-Expired header on 401 from Thunder", async () => {
    mockThunderResponse(401, { response: { err: { msg: "Session expired" } } });

    const res = await fetch(`${baseUrl}/api/proxy`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ method: "GET", path: "/slb/virtual-server" }),
    });

    expect(res.status).toBe(401);
    expect(res.headers.get("x-auth-expired")).toBe("true");
    expect(session.token).toBeNull();
  });

  it("does not add X-Auth-Expired header on non-401 errors", async () => {
    mockThunderResponse(403, { response: { err: { msg: "Forbidden" } } });

    const res = await fetch(`${baseUrl}/api/proxy`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ method: "GET", path: "/slb/virtual-server" }),
    });

    expect(res.status).toBe(403);
    expect(res.headers.get("x-auth-expired")).toBeNull();
    expect(session.token).toBe("valid-token");
  });
});
