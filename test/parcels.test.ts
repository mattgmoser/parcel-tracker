import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
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
      () => validateNewParcel({ destination: "Bristol" }),
      { message: "weightKg is required" },
    );
  });

  it("throws when weightKg is not a number", () => {
    assert.throws(
      () => validateNewParcel({ destination: "Bristol", weightKg: "heavy" }),
      { message: "weightKg must be a number" },
    );
  });

  it("throws when weightKg is zero", () => {
    assert.throws(
      () => validateNewParcel({ destination: "Bristol", weightKg: 0 }),
      { message: "weightKg must be greater than zero" },
    );
  });

  it("throws when weightKg is negative", () => {
    assert.throws(
      () => validateNewParcel({ destination: "Bristol", weightKg: -1 }),
      { message: "weightKg must be greater than zero" },
    );
  });

  it("accepts a positive weightKg without throwing", () => {
    assert.doesNotThrow(
      () => validateNewParcel({ destination: "Bristol", weightKg: 0.1 }),
    );
  });
});

// ---------------------------------------------------------------------------
// HTTP layer – POST /parcels weight validation
// ---------------------------------------------------------------------------

/** Post a JSON body to the in-process server and return { status, body }. */
async function postParcel(payload: unknown): Promise<{ status: number; body: Record<string, unknown> }> {
  return new Promise((resolve, reject) => {
    // Bind to a random port so tests can run in parallel without conflicts.
    server.listen(0, "127.0.0.1", () => {
      const address = server.address() as import("net").AddressInfo;
      const body = JSON.stringify(payload);
      const req = require("node:http").request(
        {
          hostname: "127.0.0.1",
          port: address.port,
          path: "/parcels",
          method: "POST",
          headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
        },
        (res: import("node:http").IncomingMessage) => {
          let data = "";
          res.on("data", (chunk: string) => (data += chunk));
          res.on("end", () => {
            server.close();
            resolve({ status: res.statusCode ?? 0, body: JSON.parse(data) });
          });
        },
      );
      req.on("error", (err: Error) => { server.close(); reject(err); });
      req.write(body);
      req.end();
    });
  });
}

describe("POST /parcels weight validation (HTTP)", () => {
  it("returns 400 when weightKg is missing", async () => {
    const { status, body } = await postParcel({ destination: "Norwich" });
    assert.equal(status, 400);
    assert.match(body.error as string, /weightKg is required/);
  });

  it("returns 400 when weightKg is a string", async () => {
    const { status, body } = await postParcel({ destination: "Norwich", weightKg: "ten" });
    assert.equal(status, 400);
    assert.match(body.error as string, /weightKg must be a number/);
  });

  it("returns 400 when weightKg is zero", async () => {
    const { status, body } = await postParcel({ destination: "Norwich", weightKg: 0 });
    assert.equal(status, 400);
    assert.match(body.error as string, /weightKg must be greater than zero/);
  });

  it("returns 400 when weightKg is negative", async () => {
    const { status, body } = await postParcel({ destination: "Norwich", weightKg: -5 });
    assert.equal(status, 400);
    assert.match(body.error as string, /weightKg must be greater than zero/);
  });

  it("returns 201 for a valid parcel", async () => {
    const { status, body } = await postParcel({ destination: "Norwich", weightKg: 3 });
    assert.equal(status, 201);
    assert.ok((body.parcel as Record<string, unknown>).id);
  });
});
