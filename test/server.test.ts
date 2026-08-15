import assert from "node:assert/strict";
import { request as httpRequest } from "node:http";
import type { AddressInfo } from "node:net";
import { beforeEach, describe, it } from "node:test";
import { server } from "../src/server";
import { reset } from "../src/store";

function post(path: string, body: unknown): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address() as AddressInfo;
      const req = httpRequest(
        {
          hostname: "127.0.0.1",
          port: addr.port,
          path,
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(payload),
          },
        },
        (res) => {
          let data = "";
          res.on("data", (chunk) => (data += chunk));
          res.on("end", () => {
            server.close(() => {
              resolve({ status: res.statusCode ?? 0, body: JSON.parse(data) });
            });
          });
        },
      );
      req.on("error", reject);
      req.write(payload);
      req.end();
    });
  });
}

beforeEach(() => reset());

describe("POST /parcels weightKg validation", () => {
  it("rejects a request with no weightKg", async () => {
    const { status, body } = await post("/parcels", { destination: "London" });
    assert.equal(status, 400);
    assert.match((body as { error: string }).error, /weightKg/);
  });

  it("rejects weightKg that is not a number (string)", async () => {
    const { status, body } = await post("/parcels", { destination: "London", weightKg: "heavy" });
    assert.equal(status, 400);
    assert.match((body as { error: string }).error, /weightKg/);
  });

  it("rejects weightKg of zero", async () => {
    const { status, body } = await post("/parcels", { destination: "London", weightKg: 0 });
    assert.equal(status, 400);
    assert.match((body as { error: string }).error, /weightKg/);
  });

  it("rejects negative weightKg", async () => {
    const { status, body } = await post("/parcels", { destination: "London", weightKg: -1 });
    assert.equal(status, 400);
    assert.match((body as { error: string }).error, /weightKg/);
  });

  it("accepts a positive weightKg and returns 201", async () => {
    const { status, body } = await post("/parcels", { destination: "London", weightKg: 5 });
    assert.equal(status, 201);
    assert.equal((body as { parcel: { destination: string } }).parcel.destination, "London");
  });
});
