import type { NumberFilterValue } from "../types";

const INTEGER_REGEX = /^[+-]?\d+$/;

export function parseNumber(value: string): NumberFilterValue | null {
  const number = parseFloat(value);
  if (!Number.isFinite(number)) {
    return null;
  }

  // integers within the JS number range
  if (Number.isSafeInteger(number)) {
    return number;
  }

  // integers outside the JS number range
  if (INTEGER_REGEX.test(value)) {
    return BigInt(value);
  }

  return number;
}
