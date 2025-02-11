import type { NumberFilterValue } from "../types";

const INTEGER_REGEX = /^[+-]?\d+$/;

export function parseNumber(
  value: string | number | boolean,
): NumberFilterValue | null {
  if (typeof value === "string") {
    return parseNumberFromString(value);
  }
  if (typeof value === "number") {
    return parseNumberFromNumber(value);
  }
  return null;
}

function parseNumberFromString(value: string): NumberFilterValue | null {
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
    return value;
  }

  return number;
}

function parseNumberFromNumber(value: number): number | null {
  if (!Number.isFinite(value)) {
    return null;
  }
  return value;
}
