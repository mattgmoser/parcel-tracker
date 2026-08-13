import assert from "node:assert/strict";
import { AddressInfo } from "node:net";
import { beforeEach, describe, it } from "node:test";
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

describe("POST /parcels weightKg validation", () => {
  /** Start the server on an ephemeral port and return the base URL. */
  function listen(): Promise<{ url: string; close: () => Promise<void> }> {
    return new Promise((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        const { port } = server.address() as AddressInfo;
        resolve({
          url: `http://127.0.0.1:${port}`,
          close: () => new Promise((res) => server.close(() => res())),
        });
      });
    });
  }

  async function post(url: string, body: unknown): Promise<{ status: number; body: Record<string, unknown> }> {
    const payload = JSON.stringify(body);
    const res = await fetch(url + "/parcels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
    });
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
  }

  it("rejects a request with no weightKg", async () => {
    const { url, close } = await listen();
    try {
      const { status, body } = await post(url, { destination: "Bristol" });
      assert.equal(status, 422);
      assert.ok(typeof body["error"] === "string", "response should have an error field");
    } finally {
      await close();
    }
  });

  it("rejects a weightKg of zero", async () => {
    const { url, close } = await listen();
    try {
      const { status, body } = await post(url, { destination: "Bristol", weightKg: 0 });
      assert.equal(status, 422);
      assert.ok(typeof body["error"] === "string", "response should have an error field");
    } finally {
      await close();
    }
  });

  it("rejects a negative weightKg", async () => {
    const { url, close } = await listen();
    try {
      const { status, body } = await post(url, { destination: "Bristol", weightKg: -5 });
      assert.equal(status, 422);
      assert.ok(typeof body["error"] === "string", "response should have an error field");
    } finally {
      await close();
    }
  });

  it("rejects a non-numeric weightKg", async () => {
    const { url, close } = await listen();
    try {
      const { status, body } = await post(url, { destination: "Bristol", weightKg: "heavy" });
      assert.equal(status, 422);
      assert.ok(typeof body["error"] === "string", "response should have an error field");
    } finally {
      await close();
    }
  });

  it("accepts a valid positive weightKg and returns 201", async () => {
    const { url, close } = await listen();
    try {
      const { status, body } = await post(url, { destination: "Bristol", weightKg: 3 });
      assert.equal(status, 201);
      assert.ok(body["parcel"], "response should contain the created parcel");
    } finally {
      await close();
    }
  });
});
