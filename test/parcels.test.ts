import assert from "node:assert/strict";
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
  it("returns the input unchanged when weightKg is a positive number", () => {
    const input = { destination: "Bristol", weightKg: 5 };
    assert.deepEqual(validateNewParcel(input), input);
  });

  it("throws ValidationError when weightKg is missing", () => {
    assert.throws(
      () => validateNewParcel({ destination: "Bristol" }),
      (err: unknown) => err instanceof ValidationError && /required/.test((err as Error).message),
    );
  });

  it("throws ValidationError when weightKg is a string", () => {
    assert.throws(
      () => validateNewParcel({ destination: "Bristol", weightKg: "heavy" }),
      (err: unknown) => err instanceof ValidationError && /number/.test((err as Error).message),
    );
  });

  it("throws ValidationError when weightKg is zero", () => {
    assert.throws(
      () => validateNewParcel({ destination: "Bristol", weightKg: 0 }),
      (err: unknown) => err instanceof ValidationError && /greater than zero/.test((err as Error).message),
    );
  });

  it("throws ValidationError when weightKg is negative", () => {
    assert.throws(
      () => validateNewParcel({ destination: "Bristol", weightKg: -1 }),
      (err: unknown) => err instanceof ValidationError && /greater than zero/.test((err as Error).message),
    );
  });
});

describe("POST /parcels", () => {
  // Start the server on an OS-assigned port and close it after each case.
  function withServer(fn: (port: number) => Promise<void>): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      server.listen(0, "127.0.0.1", async () => {
        const addr = server.address() as import("net").AddressInfo;
        try {
          await fn(addr.port);
          resolve();
        } catch (err) {
          reject(err);
        } finally {
          server.close();
        }
      });
    });
  }

  async function post(port: number, body: unknown): Promise<{ status: number; body: Record<string, unknown> }> {
    const payload = JSON.stringify(body);
    return new Promise((resolve, reject) => {
      const req = require("node:http").request(
        { hostname: "127.0.0.1", port, path: "/parcels", method: "POST",
          headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } },
        (res: import("node:http").IncomingMessage) => {
          let raw = "";
          res.on("data", (c: Buffer) => (raw += c));
          res.on("end", () => resolve({ status: res.statusCode ?? 0, body: JSON.parse(raw) }));
        },
      );
      req.on("error", reject);
      req.end(payload);
    });
  }

  it("returns 201 and the parcel when weightKg is valid", () =>
    withServer(async (port) => {
      const res = await post(port, { destination: "Oxford", weightKg: 3 });
      assert.equal(res.status, 201);
      assert.equal((res.body.parcel as { weightKg: number }).weightKg, 3);
    }));

  it("returns 400 when weightKg is missing", () =>
    withServer(async (port) => {
      const res = await post(port, { destination: "Oxford" });
      assert.equal(res.status, 400);
      assert.match(res.body.error as string, /required/);
    }));

  it("returns 400 when weightKg is not a number", () =>
    withServer(async (port) => {
      const res = await post(port, { destination: "Oxford", weightKg: "heavy" });
      assert.equal(res.status, 400);
      assert.match(res.body.error as string, /number/);
    }));

  it("returns 400 when weightKg is zero", () =>
    withServer(async (port) => {
      const res = await post(port, { destination: "Oxford", weightKg: 0 });
      assert.equal(res.status, 400);
      assert.match(res.body.error as string, /greater than zero/);
    }));

  it("returns 400 when weightKg is negative", () =>
    withServer(async (port) => {
      const res = await post(port, { destination: "Oxford", weightKg: -2 });
      assert.equal(res.status, 400);
      assert.match(res.body.error as string, /greater than zero/);
    }));
});
