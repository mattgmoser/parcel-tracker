# parcel-tracker

A small HTTP service for tracking parcels through a delivery network. Parcels are booked in,
advance through a fixed set of statuses, and are quoted a shipping price by weight.

## Running it

```bash
npm ci
npm run build
npm start          # listens on $PORT, default 3000
```

## Running the tests

Run the full test suite (compiles TypeScript first, then executes every `*.test.js`
file under `dist/test/` using the built-in `node:test` runner):

```bash
npm test
```

If you have already built the project and only want to re-run the tests without
recompiling, invoke the runner directly:

```bash
node --test dist/test/*.test.js
```

The test files live in `test/` and are written with `node:test` and
`node:assert/strict` — no extra test framework is needed.

### What the tests cover

| Suite | What it checks |
|---|---|
| `createParcel` | Parcels are booked with the right id sequence, destination and initial status |
| `getParcel` | Lookup returns the stored parcel, or `undefined` for an unknown id |
| `advanceParcel` | Status progresses `accepted` → `in_transit` → `delivered` and stops there |
| `quote` | Shipping price is calculated as a flat handling fee plus a per-kg rate |

## API

| Method | Path | Does |
|---|---|---|
| `GET` | `/parcels` | List every parcel |
| `POST` | `/parcels` | Book a parcel. Body: `{ "destination": "Leeds", "weightKg": 2 }` |
| `GET` | `/parcels/:id` | One parcel, with its shipping quote |
| `POST` | `/parcels/:id/advance` | Move it to the next status |

Statuses run `accepted` → `in_transit` → `delivered`. A delivered parcel does not move again.

## Layout

```
src/types.ts     the Parcel shape
src/store.ts     in-memory storage and id allocation
src/parcels.ts   booking, lookup, status changes, pricing
src/server.ts    the HTTP surface
test/            node:test suites
```

## Known gap

`POST /parcels` takes `destination` and `weightKg` straight from the request body. The carrier feed
was trusted to send well-formed records, so nothing checks them. A parcel with a negative weight,
a missing weight or an empty destination is accepted and quoted, which produces nonsense prices.
