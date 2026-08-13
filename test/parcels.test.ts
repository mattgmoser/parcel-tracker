import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import http from "node:http";
import { advanceParcel, createParcel, getParcel, quote, validateNewParcel } from "../src/parcels";
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

describe("validateNewParcel", () => {
  it("accepts a positive weightKg", () => {
    assert.doesNotThrow(() => validateNewParcel({ destination: "Bristol", weightKg: 1 }));
  });

  it("rejects a missing weightKg", () => {
    assert.throws(
      () => validateNewParcel({ destination: "Bristol" }),
      { message: "weightKg must be a number" },
    );
  });

  it("rejects a non-numeric weightKg", () => {
    assert.throws(
      () => validateNewParcel({ destination: "Bristol", weightKg: "heavy" }),
      { message: "weightKg must be a number" },
    );
  });

  it("rejects zero", () => {
    assert.throws(
      () => validateNewParcel({ destination: "Bristol", weightKg: 0 }),
      { message: "weightKg must be greater than zero" },
    );
  });

  it("rejects a negative weightKg", () => {
    assert.throws(
      () => validateNewParcel({ destination: "Bristol", weightKg: -5 }),
      { message: "weightKg must be greater than zero" },
    );
  });
});

describe("POST /parcels", () => {
  // Start a real (but ephemeral) HTTP server for each test.
  let address: { port: number };
  beforeEach(
    () =>
      new Promise<void>((resolve) => {
        server.listen(0, "127.0.0.1", () => {
          address = server.address() as { port: number };
          resolve();
        });
      }),
  );
  afterEach(
    () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  );

  function post(body: unknown): Promise<{ status: number; body: Record<string, unknown> }> {
    return new Promise((resolve, reject) => {
      const payload = JSON.stringify(body);
      const options = {
        hostname: "127.0.0.1",
        port: address.port,
        path: "/parcels",
        method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) },
      };
      const req = http.request(options, (res) => {
        let raw = "";
        res.on("data", (chunk: string) => (raw += chunk));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, body: JSON.parse(raw) }));
      });
      req.on("error", reject);
      req.write(payload);
      req.end();
    });
  }

  it("creates a parcel when weightKg is valid", async () => {
    const { status, body } = await post({ destination: "Norwich", weightKg: 3 });
    assert.equal(status, 201);
    assert.equal((body.parcel as Record<string, unknown>).weightKg, 3);
  });

  it("returns 400 when weightKg is missing", async () => {
    const { status, body } = await post({ destination: "Norwich" });
    assert.equal(status, 400);
    assert.equal(body.error, "weightKg must be a number");
  });

  it("returns 400 when weightKg is a string", async () => {
    const { status, body } = await post({ destination: "Norwich", weightKg: "heavy" });
    assert.equal(status, 400);
    assert.equal(body.error, "weightKg must be a number");
  });

  it("returns 400 when weightKg is zero", async () => {
    const { status, body } = await post({ destination: "Norwich", weightKg: 0 });
    assert.equal(status, 400);
    assert.equal(body.error, "weightKg must be greater than zero");
  });

  it("returns 400 when weightKg is negative", async () => {
    const { status, body } = await post({ destination: "Norwich", weightKg: -1 });
    assert.equal(status, 400);
    assert.equal(body.error, "weightKg must be greater than zero");
  });
});
