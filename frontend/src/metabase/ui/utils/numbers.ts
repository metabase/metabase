import type { NumericValue } from "metabase-types/api/number";

export function parseNumber(value: string): NumericValue {
  const parsedFloatValue = parseFloat(value);
  if (
    Number.isInteger(parsedFloatValue) &&
    !Number.isSafeInteger(parsedFloatValue)
  ) {
    return BigInt(value);
  }

  return parseFloat(value);
}

export function formatNumber(value: NumericValue | "") {
  return String(value);
}
