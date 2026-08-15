import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { request } from "node:http";
import { advanceParcel, createParcel, getParcel, quote } from "../src/parcels";
import { reset } from "../src/store";
import { server } from "../src/server";

beforeEach(() => reset());

describe("createParcel", () => {
  it("books a parcel and gives it a readable id", () => {
    const parcel = createParcel({ destination: "Manchester", weightKg: 2 });
    assert.equal(parcel.id, "PT-000001");
    assert.equal(parcel.destination, "Manchester");
    assert.equal(parcel.status, "accepted");
  });

  it("numbers parcels in the order they are booked", () => {
    createParcel({ destination: "Leeds", weightKg: 1 });
    const second = createParcel({ destination: "Bath", weightKg: 1 });
    assert.equal(second.id, "PT-000002");
  });
});

describe("getParcel", () => {
  it("finds a parcel that exists", () => {
    const created = createParcel({ destination: "Cardiff", weightKg: 3 });
    assert.deepEqual(getParcel(created.id), created);
  });

  it("returns nothing for an unknown id", () => {
    assert.equal(getParcel("PT-999999"), undefined);
  });
});

describe("advanceParcel", () => {
  it("moves accepted to in transit, then to delivered", () => {
    const created = createParcel({ destination: "Hull", weightKg: 1 });
    assert.equal(advanceParcel(created.id)?.status, "in_transit");
    assert.equal(advanceParcel(created.id)?.status, "delivered");
  });

  it("leaves a delivered parcel alone", () => {
    const created = createParcel({ destination: "Hull", weightKg: 1 });
    advanceParcel(created.id);
    advanceParcel(created.id);
    assert.equal(advanceParcel(created.id)?.status, "delivered");
  });
});

describe("quote", () => {
  it("charges handling plus a per-kilo rate", () => {
    const parcel = createParcel({ destination: "Derby", weightKg: 2.5 });
    assert.equal(quote(parcel), 250 + 300);
  });
});

describe("POST /parcels weightKg validation", () => {
  // Each test binds the server to a random port and closes it afterwards.
  function withServer(fn: (port: number) => Promise<void>): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      server.listen(0, "127.0.0.1", async () => {
        const addr = server.address() as import("node:net").AddressInfo;
        try {
          await fn(addr.port);
        } catch (err) {
          reject(err);
        } finally {
          server.close((err) => (err ? reject(err) : resolve()));
        }
      });
    });
  }

  function postTo(port: number, body: string): Promise<{ status: number; body: Record<string, unknown> }> {
    return new Promise((resolve, reject) => {
      const req = request({ host: "127.0.0.1", port, path: "/parcels", method: "POST",
        headers: { "Content-Type": "application/json" } }, (res) => {
        let raw = "";
        res.on("data", (chunk) => (raw += chunk));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, body: JSON.parse(raw) }));
      });
      req.on("error", reject);
      req.end(body);
    });
  }

  it("rejects a missing weightKg with 400", async () => {
    await withServer(async (port) => {
      const res = await postTo(port, JSON.stringify({ destination: "York" }));
      assert.equal(res.status, 400);
      assert.ok(typeof (res.body as { error: string }).error === "string");
    });
  });

  it("rejects a non-numeric weightKg with 400", async () => {
    await withServer(async (port) => {
      const res = await postTo(port, JSON.stringify({ destination: "York", weightKg: "heavy" }));
      assert.equal(res.status, 400);
    });
  });

  it("rejects weightKg of zero with 400", async () => {
    await withServer(async (port) => {
      const res = await postTo(port, JSON.stringify({ destination: "York", weightKg: 0 }));
      assert.equal(res.status, 400);
    });
  });

  it("rejects a negative weightKg with 400", async () => {
    await withServer(async (port) => {
      const res = await postTo(port, JSON.stringify({ destination: "York", weightKg: -1 }));
      assert.equal(res.status, 400);
    });
  });

  it("accepts a valid positive weightKg with 201", async () => {
    await withServer(async (port) => {
      const res = await postTo(port, JSON.stringify({ destination: "York", weightKg: 1.5 }));
      assert.equal(res.status, 201);
    });
  });
});
