// In-memory parcel store with CRUD helpers and a sequential ID generator.
import type { Parcel } from "./types";

/**
 * In-memory storage. A real deployment would use a database; for this service
 * the parcel list is rebuilt from the upstream carrier feed on every start.
 */
const parcels = new Map<string, Parcel>();

let counter = 0;

export function nextId(): string {
  counter += 1;
  return `PT-${String(counter).padStart(6, "0")}`;
}

export function save(parcel: Parcel): Parcel {
  parcels.set(parcel.id, parcel);
  return parcel;
}

export function find(id: string): Parcel | undefined {
  return parcels.get(id);
}

export function all(): Parcel[] {
  return [...parcels.values()];
}

/** Test helper: drop everything between cases. */
export function reset(): void {
  parcels.clear();
  counter = 0;
}
