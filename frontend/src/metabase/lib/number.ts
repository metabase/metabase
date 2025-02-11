// string is used when the value cannot be accurately represented as a JS number
export type NumberValue = number | string;

const INTEGER_REGEX = /^[+-]?\d+$/;

export function parseNumberExact(value: unknown): NumberValue | null {
  if (typeof value === "string") {
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

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  return null;
}
