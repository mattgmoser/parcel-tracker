import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import type { AddressInfo } from "node:net";
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

describe("POST /parcels – weightKg validation", () => {
  let base: string;

  // Start the server on an OS-assigned port before this suite and shut it
  // down afterwards so the test process can exit cleanly.
  before(async () => {
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const { port } = server.address() as AddressInfo;
    base = `http://127.0.0.1:${port}`;
  });

  after(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve()))
    );
  });

  async function post(body: unknown): Promise<Response> {
    return fetch(`${base}/parcels`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("accepts a valid parcel and returns 201", async () => {
    const res = await post({ destination: "Bristol", weightKg: 5 });
    assert.equal(res.status, 201);
    const data = await res.json() as { parcel: { weightKg: number } };
    assert.equal(data.parcel.weightKg, 5);
  });

  it("rejects a request with weightKg missing (400)", async () => {
    const res = await post({ destination: "Bristol" });
    assert.equal(res.status, 400);
    const data = await res.json() as { error: string };
    assert.match(data.error, /weightKg/);
  });

  it("rejects a request where weightKg is a string, not a number (400)", async () => {
    const res = await post({ destination: "Bristol", weightKg: "heavy" });
    assert.equal(res.status, 400);
    const data = await res.json() as { error: string };
    assert.match(data.error, /weightKg/);
  });

  it("rejects a request where weightKg is zero (400)", async () => {
    const res = await post({ destination: "Bristol", weightKg: 0 });
    assert.equal(res.status, 400);
    const data = await res.json() as { error: string };
    assert.match(data.error, /weightKg/);
  });

  it("rejects a request where weightKg is negative (400)", async () => {
    const res = await post({ destination: "Bristol", weightKg: -3 });
    assert.equal(res.status, 400);
    const data = await res.json() as { error: string };
    assert.match(data.error, /weightKg/);
  });
});
