import * as Lib from "metabase-lib";

export function parseNumberForColumn(
  value: string,
  column: Lib.ColumnMetadata,
): number | string | null {
  if (value.trim() === "") {
    return null;
  }

  const number = Number(value);
  if (!Number.isFinite(number)) {
    return null;
  }

  // integers within the JS number range
  if (Number.isSafeInteger(number)) {
    return number;
  }

  // integers outside the JS number range
  // check for the decimal point because the fractional part is dropped during parsing for large integers
  if (
    Lib.isBigInteger(column) &&
    Number.isInteger(number) &&
    !value.includes(".")
  ) {
    return value;
  }

  // integers outside the JS number range or fractional numbers
  if (Lib.isDecimal(column)) {
    return value;
  }

  return number;
}
