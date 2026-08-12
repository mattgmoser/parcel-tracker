import { find, nextId, save } from "./store";
import type { NewParcel, Parcel, ParcelStatus } from "./types";

const NEXT_STATUS: Record<ParcelStatus, ParcelStatus | null> = {
  accepted: "in_transit",
  in_transit: "delivered",
  delivered: null,
};

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

/**
 * Validate the fields of an incoming parcel request.
 * Throws a ValidationError describing the first problem found.
 */
export function validateNewParcel(input: unknown): NewParcel {
  const obj = input as Record<string, unknown>;
  if (typeof obj?.weightKg === "undefined") {
    throw new ValidationError("weightKg is required");
  }
  if (typeof obj.weightKg !== "number" || Number.isNaN(obj.weightKg)) {
    throw new ValidationError("weightKg must be a number");
  }
  if (obj.weightKg <= 0) {
    throw new ValidationError("weightKg must be greater than zero");
  }
  return input as NewParcel;
}

/**
 * Book a new parcel into the network.
 *
 * Call validateNewParcel before this to ensure the input is well-formed.
 */
export function createParcel(input: NewParcel): Parcel {
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
