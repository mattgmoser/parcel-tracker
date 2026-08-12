import assert from "node:assert/strict";
import { request as httpRequest, createServer } from "node:http";
import { beforeEach, describe, it } from "node:test";
import { advanceParcel, createParcel, getParcel, quote, validateNewParcel, ValidationError } from "../src/parcels";
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
  it("rejects when weightKg is missing", () => {
    assert.throws(
      () => validateNewParcel({ destination: "London" }),
      (err) => err instanceof ValidationError && /must be a number/.test(err.message),
    );
  });

  it("rejects when weightKg is a string, not a number", () => {
    assert.throws(
      () => validateNewParcel({ destination: "London", weightKg: "2" }),
      (err) => err instanceof ValidationError && /must be a number/.test(err.message),
    );
  });

  it("rejects when weightKg is zero", () => {
    assert.throws(
      () => validateNewParcel({ destination: "London", weightKg: 0 }),
      (err) => err instanceof ValidationError && /greater than zero/.test(err.message),
    );
  });

  it("rejects when weightKg is negative", () => {
    assert.throws(
      () => validateNewParcel({ destination: "London", weightKg: -1 }),
      (err) => err instanceof ValidationError && /greater than zero/.test(err.message),
    );
  });

  it("accepts a positive weightKg", () => {
    const result = validateNewParcel({ destination: "London", weightKg: 1.5 });
    assert.equal(result.weightKg, 1.5);
  });
});

/** Spin up a temporary HTTP server backed by the app's request listener,
 *  POST a JSON body, collect the response, then shut the temporary server down. */
function postParcels(body: unknown): Promise<{ status: number; body: Record<string, unknown> }> {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    // Reuse the app's request listener without occupying the production port.
    const listener = server.listeners("request")[0] as Parameters<typeof createServer>[0];
    const tmp = createServer(listener);
    tmp.listen(0, "127.0.0.1", () => {
      const { port } = tmp.address() as { port: number };
      const req = httpRequest(
        {
          host: "127.0.0.1",
          port,
          path: "/parcels",
          method: "POST",
          headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) },
        },
        (res) => {
          let data = "";
          res.on("data", (chunk) => (data += chunk));
          res.on("end", () => {
            tmp.close();
            resolve({ status: res.statusCode!, body: JSON.parse(data) });
          });
        },
      );
      req.on("error", (err) => { tmp.close(); reject(err); });
      req.write(payload);
      req.end();
    });
  });
}

describe("POST /parcels – weight validation", () => {
  it("returns 400 when weightKg is missing", async () => {
    const res = await postParcels({ destination: "Bristol" });
    assert.equal(res.status, 400);
    assert.match(res.body.error as string, /must be a number/);
  });

  it("returns 400 when weightKg is a string", async () => {
    const res = await postParcels({ destination: "Bristol", weightKg: "heavy" });
    assert.equal(res.status, 400);
    assert.match(res.body.error as string, /must be a number/);
  });

  it("returns 400 when weightKg is zero", async () => {
    const res = await postParcels({ destination: "Bristol", weightKg: 0 });
    assert.equal(res.status, 400);
    assert.match(res.body.error as string, /greater than zero/);
  });

  it("returns 400 when weightKg is negative", async () => {
    const res = await postParcels({ destination: "Bristol", weightKg: -5 });
    assert.equal(res.status, 400);
    assert.match(res.body.error as string, /greater than zero/);
  });

  it("returns 201 when weightKg is a positive number", async () => {
    const res = await postParcels({ destination: "Bristol", weightKg: 3 });
    assert.equal(res.status, 201);
    assert.ok((res.body.parcel as any).id);
  });
});
