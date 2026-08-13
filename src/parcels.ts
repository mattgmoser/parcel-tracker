import { find, nextId, save } from "./store";
import type { NewParcel, Parcel, ParcelStatus } from "./types";

const NEXT_STATUS: Record<ParcelStatus, ParcelStatus | null> = {
  accepted: "in_transit",
  in_transit: "delivered",
  delivered: null,
};

/**
 * Throws a RangeError when weightKg is missing, not a finite number, or ≤ 0.
 */
export function validateWeight(weightKg: unknown): void {
  if (typeof weightKg !== "number" || !isFinite(weightKg) || weightKg <= 0) {
    throw new RangeError("weightKg must be a number greater than zero");
  }
}

/**
 * Book a new parcel into the network.
 *
 * Validates weightKg before persisting; throws RangeError on bad input.
 */
export function createParcel(input: NewParcel): Parcel {
  validateWeight(input.weightKg);
  return save({
    id: nextId(),
    destination: input.destination,
    weightKg: input.weightKg,
    status: "accepted",
    createdAt: new Date().toISOString(),
  });
}

export function getParcel(id: string): Parcel | undefined {
  return find(id);
}

/** Move a parcel to the next status. Delivered parcels do not move again. */
export function advanceParcel(id: string): Parcel | undefined {
  const parcel = find(id);
  if (!parcel) return undefined;

  const next = NEXT_STATUS[parcel.status];
  if (!next) return parcel;

  return save({ ...parcel, status: next });
}

/** Shipping cost in pence: a flat handling fee plus a per-kilo rate. */
export function quote(parcel: Parcel): number {
  const HANDLING_PENCE = 250;
  const PER_KG_PENCE = 120;
  return HANDLING_PENCE + Math.round(parcel.weightKg * PER_KG_PENCE);
}
