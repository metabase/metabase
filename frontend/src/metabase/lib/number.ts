import type { NumericValue } from "metabase-types/api/number";

export function isPositiveInteger(value: any) {
  return /^\d+$/.test(String(value));
}

export function parseNumberValue(value: any): number | null {
  const number = Number.parseFloat(value);

  if (Number.isFinite(number)) {
    return number;
  } else {
    return null;
  }
}

export function isInteger(num: unknown): num is NumericValue {
  return Number.isInteger(num) || typeof num === "bigint";
}

export function isFloat(num: unknown): num is number {
  return typeof Number.isFinite(num) && !Number.isInteger(num);
}
