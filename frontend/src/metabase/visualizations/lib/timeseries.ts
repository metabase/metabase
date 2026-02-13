import { isDate } from "metabase-lib/v1/types/utils/isa";

import { isValidIso8601 } from "./date-validation";

const TIMESERIES_UNITS = new Set([
  "minute",
  "hour",
  "day",
  "week",
  "month",
  "quarter",
  "year", // https://github.com/metabase/metabase/issues/1992
]);

interface DatasetLike {
  cols: { unit?: string }[];
  rows: unknown[][];
}

export function dimensionIsTimeseries(
  { cols, rows }: DatasetLike,
  i = 0,
): boolean {
  if (dimensionIsExplicitTimeseries({ cols, rows }, i)) {
    return true;
  }

  let hasNonNull = false;

  for (const row of rows) {
    const value = row[i];

    if (value == null) {
      continue;
    }

    hasNonNull = true;

    if (typeof value === "number" && !Number.isInteger(value)) {
      return false;
    }

    if (!isValidIso8601(value)) {
      return false;
    }
  }

  return hasNonNull;
}

export function dimensionIsExplicitTimeseries(
  { cols }: { cols: { unit?: string }[] },
  i: number,
): boolean {
  return (
    isDate(cols[i]) &&
    (cols[i].unit == null || TIMESERIES_UNITS.has(cols[i].unit))
  );
}
