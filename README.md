# parcel-tracker

A small HTTP service for tracking parcels through a delivery network. Parcels are booked in,
advance through a fixed set of statuses, and are quoted a shipping price by weight.

## Running it

```bash
npm ci
npm run build
npm start          # listens on $PORT, default 3000
```

## Tests

```bash
npm test           # compiles, then runs node:test against dist/
```

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

## Notes

The in-memory store is not persisted; restarting the process clears all parcel records.

## Known gap

`POST /parcels` takes `destination` and `weightKg` straight from the request body. The carrier feed
was trusted to send well-formed records, so nothing checks them. A parcel with a negative weight,
a missing weight or an empty destination is accepted and quoted, which produces nonsense prices.
