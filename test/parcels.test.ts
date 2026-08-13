import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { advanceParcel, createParcel, getParcel, quote, validateNewParcel, ValidationError } from "../src/parcels";
import { reset } from "../src/store";
import { server } from "../src/server";
import type { IncomingMessage } from "node:http";

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

describe("validateNewParcel", () => {
  it("accepts a valid parcel", () => {
    const result = validateNewParcel({ destination: "Bristol", weightKg: 1.5 });
    assert.equal(result.weightKg, 1.5);
  });

  it("rejects when weightKg is missing", () => {
    assert.throws(
      () => validateNewParcel({ destination: "Bristol" }),
      (err: unknown) => err instanceof ValidationError && /required/.test(err.message),
    );
  });

  it("rejects when weightKg is a string", () => {
    assert.throws(
      () => validateNewParcel({ destination: "Bristol", weightKg: "heavy" }),
      (err: unknown) => err instanceof ValidationError && /number/.test(err.message),
    );
  });

  it("rejects when weightKg is NaN", () => {
    assert.throws(
      () => validateNewParcel({ destination: "Bristol", weightKg: NaN }),
      (err: unknown) => err instanceof ValidationError && /number/.test(err.message),
    );
  });

  it("rejects when weightKg is zero", () => {
    assert.throws(
      () => validateNewParcel({ destination: "Bristol", weightKg: 0 }),
      (err: unknown) => err instanceof ValidationError && /greater than zero/.test(err.message),
    );
  });

  it("rejects when weightKg is negative", () => {
    assert.throws(
      () => validateNewParcel({ destination: "Bristol", weightKg: -3 }),
      (err: unknown) => err instanceof ValidationError && /greater than zero/.test(err.message),
    );
  });
});

// Helper: start the server on an OS-assigned port, run fn, then close it.
function withServer(fn: (baseUrl: string) => Promise<void>): Promise<void> {
  return new Promise((resolve, reject) => {
    server.listen(0, "127.0.0.1", async () => {
      const addr = server.address() as { port: number };
      const baseUrl = `http://127.0.0.1:${addr.port}`;
      try {
        await fn(baseUrl);
        resolve();
      } catch (err) {
        reject(err);
      } finally {
        server.close();
      }
    });
  });
}

async function post(url: string, body: unknown): Promise<{ status: number; body: Record<string, unknown> }> {
  const payload = JSON.stringify(body);
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const http = require("node:http") as typeof import("node:http");
  return new Promise((resolve, reject) => {
    const req = http.request(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) },
    }, (res: IncomingMessage) => {
      let raw = "";
      res.on("data", (chunk: Buffer) => (raw += chunk));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body: JSON.parse(raw) }));
    });
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

describe("POST /parcels weightKg validation (HTTP)", () => {
  it("returns 201 for a valid parcel", () =>
    withServer(async (base) => {
      const res = await post(`${base}/parcels`, { destination: "Norwich", weightKg: 2 });
      assert.equal(res.status, 201);
      assert.ok((res.body as any).parcel.id);
    }),
  );

  it("returns 400 when weightKg is missing", () =>
    withServer(async (base) => {
      const res = await post(`${base}/parcels`, { destination: "Norwich" });
      assert.equal(res.status, 400);
      assert.match((res.body as any).error, /required/);
    }),
  );

  it("returns 400 when weightKg is a string", () =>
    withServer(async (base) => {
      const res = await post(`${base}/parcels`, { destination: "Norwich", weightKg: "heavy" });
      assert.equal(res.status, 400);
      assert.match((res.body as any).error, /number/);
    }),
  );

  it("returns 400 when weightKg is zero", () =>
    withServer(async (base) => {
      const res = await post(`${base}/parcels`, { destination: "Norwich", weightKg: 0 });
      assert.equal(res.status, 400);
      assert.match((res.body as any).error, /greater than zero/);
    }),
  );

  it("returns 400 when weightKg is negative", () =>
    withServer(async (base) => {
      const res = await post(`${base}/parcels`, { destination: "Norwich", weightKg: -1 });
      assert.equal(res.status, 400);
      assert.match((res.body as any).error, /greater than zero/);
    }),
  );
});
