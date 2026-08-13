import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
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
  it("throws when weightKg is missing", () => {
    assert.throws(
      () => validateNewParcel({ destination: "Bristol" } as any),
      RangeError,
    );
  });

  it("throws when weightKg is not a number", () => {
    assert.throws(
      () => validateNewParcel({ destination: "Bristol", weightKg: "heavy" as any }),
      RangeError,
    );
  });

  it("throws when weightKg is zero", () => {
    assert.throws(
      () => validateNewParcel({ destination: "Bristol", weightKg: 0 }),
      RangeError,
    );
  });

  it("throws when weightKg is negative", () => {
    assert.throws(
      () => validateNewParcel({ destination: "Bristol", weightKg: -1 }),
      RangeError,
    );
  });

  it("accepts a positive weight", () => {
    assert.doesNotThrow(
      () => validateNewParcel({ destination: "Bristol", weightKg: 0.1 }),
    );
  });
});

describe("POST /parcels weight validation", () => {
  // Start the server on a random port and tear it down after each test.
  let port: number;

  beforeEach(async () => {
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        port = (server.address() as import("node:net").AddressInfo).port;
        resolve();
      });
    });
  });

  afterEach(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  });

  async function post(body: unknown): Promise<{ status: number; data: any }> {
    const res = await fetch(`http://127.0.0.1:${port}/parcels`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return { status: res.status, data: await res.json() };
  }

  it("returns 400 when weightKg is missing", async () => {
    const { status, data } = await post({ destination: "Exeter" });
    assert.equal(status, 400);
    assert.match(data.error, /weightKg/);
  });

  it("returns 400 when weightKg is a string", async () => {
    const { status, data } = await post({ destination: "Exeter", weightKg: "five" });
    assert.equal(status, 400);
    assert.match(data.error, /weightKg/);
  });

  it("returns 400 when weightKg is zero", async () => {
    const { status, data } = await post({ destination: "Exeter", weightKg: 0 });
    assert.equal(status, 400);
    assert.match(data.error, /weightKg/);
  });

  it("returns 400 when weightKg is negative", async () => {
    const { status, data } = await post({ destination: "Exeter", weightKg: -3 });
    assert.equal(status, 400);
    assert.match(data.error, /weightKg/);
  });

  it("returns 201 when weightKg is a positive number", async () => {
    const { status, data } = await post({ destination: "Exeter", weightKg: 5 });
    assert.equal(status, 201);
    assert.equal(data.parcel.weightKg, 5);
  });
});
