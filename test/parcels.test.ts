import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { advanceParcel, createParcel, getParcel, ParcelValidationError, quote, validateNewParcel } from "../src/parcels";
import { server } from "../src/server";
import { reset } from "../src/store";

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
  it("returns the input unchanged when weightKg is a positive number", () => {
    const input = { destination: "Bristol", weightKg: 5 };
    assert.deepEqual(validateNewParcel(input), input);
  });

  it("throws ParcelValidationError when weightKg is missing", () => {
    assert.throws(
      () => validateNewParcel({ destination: "Bristol" }),
      (err) => err instanceof ParcelValidationError && /required/i.test(err.message),
    );
  });

  it("throws ParcelValidationError when weightKg is a string", () => {
    assert.throws(
      () => validateNewParcel({ destination: "Bristol", weightKg: "heavy" }),
      (err) => err instanceof ParcelValidationError && /number/i.test(err.message),
    );
  });

  it("throws ParcelValidationError when weightKg is zero", () => {
    assert.throws(
      () => validateNewParcel({ destination: "Bristol", weightKg: 0 }),
      (err) => err instanceof ParcelValidationError && /greater than zero/i.test(err.message),
    );
  });

  it("throws ParcelValidationError when weightKg is negative", () => {
    assert.throws(
      () => validateNewParcel({ destination: "Bristol", weightKg: -1 }),
      (err) => err instanceof ParcelValidationError && /greater than zero/i.test(err.message),
    );
  });
});

describe("POST /parcels – weightKg validation", () => {
  // Start the server on an OS-assigned port and close it after the suite.
  let baseUrl: string;

  beforeEach(() => {
    server.listen(0);
    const addr = server.address() as { port: number };
    baseUrl = `http://localhost:${addr.port}`;
  });

  afterEach(() => {
    server.close();
  });

  async function post(body: unknown): Promise<{ status: number; data: Record<string, unknown> }> {
    const res = await fetch(`${baseUrl}/parcels`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return { status: res.status, data: (await res.json()) as Record<string, unknown> };
  }

  it("returns 201 when weightKg is a positive number", async () => {
    const { status } = await post({ destination: "Exeter", weightKg: 3 });
    assert.equal(status, 201);
  });

  it("returns 400 when weightKg is absent", async () => {
    const { status, data } = await post({ destination: "Exeter" });
    assert.equal(status, 400);
    assert.match(data.error as string, /required/i);
  });

  it("returns 400 when weightKg is a string", async () => {
    const { status, data } = await post({ destination: "Exeter", weightKg: "heavy" });
    assert.equal(status, 400);
    assert.match(data.error as string, /number/i);
  });

  it("returns 400 when weightKg is zero", async () => {
    const { status, data } = await post({ destination: "Exeter", weightKg: 0 });
    assert.equal(status, 400);
    assert.match(data.error as string, /greater than zero/i);
  });

  it("returns 400 when weightKg is negative", async () => {
    const { status, data } = await post({ destination: "Exeter", weightKg: -10 });
    assert.equal(status, 400);
    assert.match(data.error as string, /greater than zero/i);
  });
});
