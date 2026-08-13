import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { advanceParcel, createParcel, getParcel, quote } from "../src/parcels";
import { reset } from "../src/store";
import { server } from "../src/server";
import { request as httpRequest } from "node:http";

/** POST /parcels over the real HTTP server and return { status, body }. */
function postParcel(body: unknown): Promise<{ status: number; body: Record<string, unknown> }> {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = httpRequest(
      { host: "127.0.0.1", port: (server.address() as import("node:net").AddressInfo).port, path: "/parcels", method: "POST", headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, body: JSON.parse(data) }));
      },
    );
    req.on("error", reject);
    req.end(payload);
  });
}

beforeEach(() => reset());

// Start a real server on an OS-assigned port for HTTP-level tests.
before(
  () =>
    new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve());
    }),
);
after(() => new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve()))));

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

describe("createParcel – weight validation", () => {
  it("throws when weightKg is missing", () => {
    assert.throws(
      () => createParcel({ destination: "Norwich" } as never),
      RangeError,
    );
  });

  it("throws when weightKg is zero", () => {
    assert.throws(
      () => createParcel({ destination: "Norwich", weightKg: 0 }),
      RangeError,
    );
  });

  it("throws when weightKg is negative", () => {
    assert.throws(
      () => createParcel({ destination: "Norwich", weightKg: -5 }),
      RangeError,
    );
  });

  it("throws when weightKg is not a number", () => {
    assert.throws(
      () => createParcel({ destination: "Norwich", weightKg: "heavy" as never }),
      RangeError,
    );
  });
});

describe("POST /parcels – weight validation", () => {
  it("returns 400 when weightKg is missing", async () => {
    const { status, body } = await postParcel({ destination: "Norwich" });
    assert.equal(status, 400);
    assert.equal(typeof body.error, "string");
  });

  it("returns 400 when weightKg is zero", async () => {
    const { status, body } = await postParcel({ destination: "Norwich", weightKg: 0 });
    assert.equal(status, 400);
    assert.equal(typeof body.error, "string");
  });

  it("returns 400 when weightKg is negative", async () => {
    const { status, body } = await postParcel({ destination: "Norwich", weightKg: -1 });
    assert.equal(status, 400);
    assert.equal(typeof body.error, "string");
  });

  it("returns 400 when weightKg is a string", async () => {
    const { status, body } = await postParcel({ destination: "Norwich", weightKg: "heavy" });
    assert.equal(status, 400);
    assert.equal(typeof body.error, "string");
  });

  it("returns 201 for a valid positive weightKg", async () => {
    const { status } = await postParcel({ destination: "Norwich", weightKg: 3 });
    assert.equal(status, 201);
  });
});
