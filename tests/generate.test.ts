import { describe, it, expect } from "vitest";
import { getAllowedMethods } from "../generate_openapi.ts";

describe("getAllowedMethods", () => {
  it("returns only GET for /oper paths", () => {
    expect(getAllowedMethods("/axapi/v3/slb/virtual-server/oper")).toEqual(["get"]);
  });

  it("returns only GET for /stats paths", () => {
    expect(getAllowedMethods("/axapi/v3/slb/virtual-server/stats")).toEqual(["get"]);
  });

  it("returns only GET for paths containing /oper/", () => {
    expect(getAllowedMethods("/axapi/v3/slb/virtual-server/oper/details")).toEqual(["get"]);
  });

  it("returns only GET for paths containing /stats/", () => {
    expect(getAllowedMethods("/axapi/v3/slb/virtual-server/stats/details")).toEqual(["get"]);
  });

  it("ignores operation-not-allowed for /oper paths", () => {
    expect(getAllowedMethods("/axapi/v3/slb/server/oper", ["PUT"])).toEqual(["get"]);
  });

  it("returns full CRUD when no operation-not-allowed field", () => {
    expect(getAllowedMethods("/axapi/v3/slb/server")).toEqual(["get", "post", "put", "delete"]);
  });

  it("returns full CRUD when operation-not-allowed is undefined", () => {
    expect(getAllowedMethods("/axapi/v3/slb/server", undefined)).toEqual(["get", "post", "put", "delete"]);
  });

  it("returns full CRUD when operation-not-allowed is empty array", () => {
    expect(getAllowedMethods("/axapi/v3/slb/server", [])).toEqual(["get", "post", "put", "delete"]);
  });

  it("excludes PUT, POST, DELETE when disallowed — only GET remains", () => {
    expect(getAllowedMethods("/axapi/v3/cgnv6/lsn", ["PUT", "POST", "DELETE"])).toEqual(["get"]);
  });

  it("excludes GET when disallowed — POST, PUT, DELETE remain", () => {
    expect(getAllowedMethods("/axapi/v3/some/write-only", ["GET"])).toEqual(["post", "put", "delete"]);
  });

  it("excludes single method", () => {
    expect(getAllowedMethods("/axapi/v3/scm/licenseinfo", ["PUT"])).toEqual(["get", "post", "delete"]);
  });

  it("returns empty array when all methods disallowed", () => {
    expect(getAllowedMethods("/axapi/v3/some/endpoint", ["GET", "POST", "PUT", "DELETE"])).toEqual([]);
  });

  it("handles case-insensitive method matching", () => {
    expect(getAllowedMethods("/axapi/v3/some/endpoint", ["put", "Post"])).toEqual(["get", "delete"]);
  });

  it("handles mixed case in operation-not-allowed", () => {
    expect(getAllowedMethods("/axapi/v3/some/endpoint", ["get", "DELETE"])).toEqual(["post", "put"]);
  });
});
