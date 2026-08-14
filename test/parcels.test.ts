import assert from "node:assert/strict";
import { request } from "node:http";
import { afterEach, beforeEach, describe, it } from "node:test";
import { advanceParcel, createParcel, getParcel, quote } from "../src/parcels";
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

/** Helper: POST to /parcels on an already-listening server and resolve with the response status + body. */
function postParcel(port: number, body: unknown): Promise<{ status: number; body: Record<string, unknown> }> {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = request(
      { hostname: "127.0.0.1", port, method: "POST", path: "/parcels",
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } },
      (res) => {
        let raw = "";
        res.on("data", (chunk) => (raw += chunk));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, body: JSON.parse(raw) }));
      },
    );
    req.on("error", reject);
    req.end(payload);
  });
}

describe("POST /parcels weightKg validation", () => {
  let port: number;

  beforeEach(() =>
    new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        port = (server.address() as import("node:net").AddressInfo).port;
        resolve();
      });
    }),
  );

  afterEach(() => new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve()))));

  it("rejects a request where weightKg is missing", async () => {
    const res = await postParcel(port, { destination: "London" });
    assert.equal(res.status, 400);
    assert.match(res.body.error as string, /weightKg/);
  });

  it("rejects a request where weightKg is not a number", async () => {
    const res = await postParcel(port, { destination: "London", weightKg: "heavy" });
    assert.equal(res.status, 400);
    assert.match(res.body.error as string, /weightKg/);
  });

  it("rejects a request where weightKg is zero", async () => {
    const res = await postParcel(port, { destination: "London", weightKg: 0 });
    assert.equal(res.status, 400);
    assert.match(res.body.error as string, /weightKg/);
  });

  it("rejects a request where weightKg is negative", async () => {
    const res = await postParcel(port, { destination: "London", weightKg: -5 });
    assert.equal(res.status, 400);
    assert.match(res.body.error as string, /weightKg/);
  });

  it("accepts a valid positive weightKg", async () => {
    const res = await postParcel(port, { destination: "London", weightKg: 3 });
    assert.equal(res.status, 201);
    assert.equal((res.body.parcel as { weightKg: number }).weightKg, 3);
  });
});
