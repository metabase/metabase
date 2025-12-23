const INTEGER_REGEX = /^[+-]?\d+$/;

export type NumberValue = number | bigint;

export function parseNumber(value: string): NumberValue | null {
  // TODO(eric, 2025-12-23): we should check if the string is a valid number
  // if value === "1j", this function returns 1
  // I tried it and it broke a number of tests
  // Example:
  //   if (!Number.isFinite(Number(value))) {
  //     return null;
  //    }

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

/**
 * @deprecated: use parseNumber to avoid precision loss
 */
export function parseNumberValue(value: any): number | null {
  const number = Number.parseFloat(value);

  if (Number.isFinite(number)) {
    return number;
  } else {
    return null;
  }
}
