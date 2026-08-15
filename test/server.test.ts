import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { request } from "node:http";
import { AddressInfo } from "node:net";
import { server } from "../src/server";
import { reset } from "../src/store";

function post(port: number, path: string, body: unknown): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = request(
      { hostname: "127.0.0.1", port, path, method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode ?? 0, body: JSON.parse(data) });
          } catch (e) {
            reject(e);
          }
        });
      },
    );
    req.on("error", reject);
    req.end(payload);
  });
}

describe("POST /parcels weightKg validation", () => {
  let port: number;

  beforeEach((_, done) => {
    reset();
    server.listen(0, "127.0.0.1", () => {
      port = (server.address() as AddressInfo).port;
      done();
    });
  });

  afterEach((_, done) => {
    server.close(() => done());
  });

  it("accepts a valid parcel and returns 201", async () => {
    const result = await post(port, "/parcels", { destination: "London", weightKg: 1.5 });
    assert.equal(result.status, 201);
  });

  it("rejects a missing weightKg with 422", async () => {
    const result = await post(port, "/parcels", { destination: "London" });
    assert.equal(result.status, 422);
    assert.equal((result.body as { error: string }).error, "weightKg must be a number greater than zero");
  });

  it("rejects weightKg of zero with 422", async () => {
    const result = await post(port, "/parcels", { destination: "London", weightKg: 0 });
    assert.equal(result.status, 422);
  });

  it("rejects a negative weightKg with 422", async () => {
    const result = await post(port, "/parcels", { destination: "London", weightKg: -5 });
    assert.equal(result.status, 422);
  });

  it("rejects a string weightKg with 422", async () => {
    const result = await post(port, "/parcels", { destination: "London", weightKg: "heavy" });
    assert.equal(result.status, 422);
  });
});
