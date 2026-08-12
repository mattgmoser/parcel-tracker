import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { advanceParcel, createParcel, getParcel, quote, validateNewParcel } from "../src/parcels";
import { reset } from "../src/store";
import { server } from "../src/server";
import type { AddressInfo } from "node:net";

/** Fire a POST /parcels request and return { status, body }. */
async function postParcel(payload: unknown): Promise<{ status: number; body: Record<string, unknown> }> {
  await new Promise<void>((resolve) => {
    if (server.listening) return resolve();
    server.listen(0, "127.0.0.1", resolve);
  });
  const { port } = server.address() as AddressInfo;
  const res = await fetch(`http://127.0.0.1:${port}/parcels`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

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
      (err) => err instanceof TypeError && /weightKg is required/i.test(err.message),
    );
  });

  it("rejects a non-numeric weightKg", () => {
    assert.throws(
      () => validateNewParcel({ destination: "Bristol", weightKg: "heavy" }),
      (err) => err instanceof TypeError && /weightKg must be a number/i.test(err.message),
    );
  });

  it("rejects weightKg of zero", () => {
    assert.throws(
      () => validateNewParcel({ destination: "Bristol", weightKg: 0 }),
      (err) => err instanceof TypeError && /weightKg must be greater than zero/i.test(err.message),
    );
  });

  it("rejects a negative weightKg", () => {
    assert.throws(
      () => validateNewParcel({ destination: "Bristol", weightKg: -5 }),
      (err) => err instanceof TypeError && /weightKg must be greater than zero/i.test(err.message),
    );
  });
});

describe("POST /parcels", () => {
  it("creates a parcel for a valid request", async () => {
    const { status, body } = await postParcel({ destination: "Norwich", weightKg: 3 });
    assert.equal(status, 201);
    assert.equal((body.parcel as { destination: string }).destination, "Norwich");
  });

  it("returns 400 when weightKg is missing", async () => {
    const { status, body } = await postParcel({ destination: "Norwich" });
    assert.equal(status, 400);
    assert.match(body.error as string, /weightKg is required/i);
  });

  it("returns 400 when weightKg is not a number", async () => {
    const { status, body } = await postParcel({ destination: "Norwich", weightKg: "heavy" });
    assert.equal(status, 400);
    assert.match(body.error as string, /weightKg must be a number/i);
  });

  it("returns 400 when weightKg is zero", async () => {
    const { status, body } = await postParcel({ destination: "Norwich", weightKg: 0 });
    assert.equal(status, 400);
    assert.match(body.error as string, /weightKg must be greater than zero/i);
  });

  it("returns 400 when weightKg is negative", async () => {
    const { status, body } = await postParcel({ destination: "Norwich", weightKg: -1 });
    assert.equal(status, 400);
    assert.match(body.error as string, /weightKg must be greater than zero/i);
  });
});
