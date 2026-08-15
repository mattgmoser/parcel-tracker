import assert from "node:assert/strict";
import http from "node:http";
import { afterEach, beforeEach, describe, it } from "node:test";
import { advanceParcel, createParcel, getParcel, quote } from "../src/parcels";
import { reset } from "../src/store";
import { server } from "../src/server";

/** POST JSON to the test server and return status + parsed body. */
function postJSON(
  port: number,
  path: string,
  body: unknown
): Promise<{ status: number; body: Record<string, unknown> }> {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
        },
      },
      (res) => {
        let raw = "";
        res.on("data", (chunk: string) => (raw += chunk));
        res.on("end", () =>
          resolve({ status: res.statusCode ?? 0, body: JSON.parse(raw) })
        );
      }
    );
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
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

  it("rejects a missing weightKg", () => {
    assert.throws(
      () => createParcel({ destination: "Bristol" } as never),
      RangeError
    );
  });

  it("rejects weightKg that is not a number", () => {
    assert.throws(
      () => createParcel({ destination: "Bristol", weightKg: "heavy" } as never),
      RangeError
    );
  });

  it("rejects weightKg of zero", () => {
    assert.throws(
      () => createParcel({ destination: "Bristol", weightKg: 0 }),
      RangeError
    );
  });

  it("rejects negative weightKg", () => {
    assert.throws(
      () => createParcel({ destination: "Bristol", weightKg: -1 }),
      RangeError
    );
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

describe("POST /parcels", () => {
  let port: number;

  beforeEach(
    () =>
      new Promise<void>((resolve) => {
        server.listen(0, "127.0.0.1", () => {
          port = (server.address() as import("node:net").AddressInfo).port;
          resolve();
        });
      })
  );

  afterEach(
    () =>
      new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve()))
      )
  );

  it("returns 201 and the new parcel for a valid request", async () => {
    const { status, body } = await postJSON(port, "/parcels", {
      destination: "London",
      weightKg: 3,
    });
    assert.equal(status, 201);
    assert.equal((body.parcel as Record<string, unknown>).destination, "London");
    assert.equal(typeof body.quotePence, "number");
  });

  it("returns 400 when weightKg is missing", async () => {
    const { status, body } = await postJSON(port, "/parcels", {
      destination: "London",
    });
    assert.equal(status, 400);
    assert.equal(typeof body.error, "string");
  });

  it("returns 400 when weightKg is not a number", async () => {
    const { status, body } = await postJSON(port, "/parcels", {
      destination: "London",
      weightKg: "heavy",
    });
    assert.equal(status, 400);
    assert.equal(typeof body.error, "string");
  });

  it("returns 400 when weightKg is zero", async () => {
    const { status, body } = await postJSON(port, "/parcels", {
      destination: "London",
      weightKg: 0,
    });
    assert.equal(status, 400);
    assert.equal(typeof body.error, "string");
  });

  it("returns 400 when weightKg is negative", async () => {
    const { status, body } = await postJSON(port, "/parcels", {
      destination: "London",
      weightKg: -5,
    });
    assert.equal(status, 400);
    assert.equal(typeof body.error, "string");
  });
});
