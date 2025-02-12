const INTEGER_REGEX = /^[+-]?\d+$/;

export function parseNumber(value: string): number | string | null {
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
