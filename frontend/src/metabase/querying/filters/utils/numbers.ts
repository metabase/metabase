import * as Lib from "metabase-lib";

const INTEGER_REGEX = /^[+-]?\d+$/;

type ParseNumberOpts = {
  withBigInt?: boolean;
};

export function parseNumber(
  value: string,
  opts?: ParseNumberOpts,
): number | bigint | null {
  const number = parseFloat(value);
  if (!Number.isFinite(number)) {
    return null;
  }

  // integers within the JS number range
  if (Number.isSafeInteger(number)) {
    return number;
  }

  // integers outside the JS number range
  if (opts?.withBigInt && INTEGER_REGEX.test(value)) {
    return BigInt(value);
  }

  return number;
}

export function parseNumberForColumn(
  value: string,
  column: Lib.ColumnMetadata,
): Lib.NumberFilterValue | null {
  return parseNumber(value, { withBigInt: Lib.isBigInteger(column) });
}
