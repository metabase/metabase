import * as Lib from "metabase-lib";

const INTEGER_REGEX = /^[+-]?\d+$/;
const DECIMAL_REGEX = /^[+-]?\d+(\.\d+)?$/;

export function parseNumberForColumn(
  value: string,
  column: Lib.ColumnMetadata,
): number | string | null {
  const number = parseFloat(value);
  if (!Number.isFinite(number)) {
    return null;
  }

  // integers within the JS number range
  if (Number.isSafeInteger(number)) {
    return number;
  }

  // integers outside the JS number range
  if (Lib.isBigInteger(column) && INTEGER_REGEX.test(value)) {
    return value;
  }

  // integers outside the JS number range or fractional numbers
  if (Lib.isDecimal(column) && DECIMAL_REGEX.test(value)) {
    return value;
  }

  return number;
}
