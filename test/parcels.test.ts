import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { advanceParcel, createParcel, getParcel, quote, validateWeightKg } from "../src/parcels";
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

describe("validateWeightKg", () => {
  it("returns null for a valid positive weight", () => {
    assert.equal(validateWeightKg(1), null);
    assert.equal(validateWeightKg(0.1), null);
    assert.equal(validateWeightKg(1000), null);
  });

  it("rejects a missing weight", () => {
    assert.match(validateWeightKg(undefined) as string, /required/);
    assert.match(validateWeightKg(null) as string, /required/);
  });

  it("rejects a non-number weight", () => {
    assert.match(validateWeightKg("5") as string, /number/);
    assert.match(validateWeightKg(true) as string, /number/);
    assert.match(validateWeightKg(NaN) as string, /number/);
    assert.match(validateWeightKg(Infinity) as string, /number/);
  });

  it("rejects zero", () => {
    assert.match(validateWeightKg(0) as string, /greater than zero/);
  });

  it("rejects a negative weight", () => {
    assert.match(validateWeightKg(-1) as string, /greater than zero/);
  });
});
