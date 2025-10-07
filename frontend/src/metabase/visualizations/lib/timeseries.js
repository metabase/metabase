import { isDate } from "metabase-lib/v1/types/utils/isa";

const TIMESERIES_UNITS = new Set([
  "minute",
  "hour",
  "day",
  "week",
  "month",
  "quarter",
  "year", // https://github.com/metabase/metabase/issues/1992
]);

// Comprehensive ISO 8601 regex pattern
// Covers: YYYY-MM-DD, YYYY-MM-DD HH:mm:ss, YYYY-MM-DDTHH:mm:ss, with optional timezone, compact formats, week dates, ordinal dates
const ISO_8601_REGEX =
  /^(\d{4})-?(\d{2})-?(\d{2})([ T](\d{2}):?(\d{2}):?(\d{2})(\.\d+)?(Z|[+-]\d{2}:?\d{2})?)?$|^(\d{4})-W(\d{2})(-(\d))?$|^(\d{4})-(\d{3})$/;

function isValidISO8601(dateString) {
  return ISO_8601_REGEX.test(dateString);
}

export function dimensionIsTimeseries({ cols, rows }, i = 0) {
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

    if (!isValidISO8601(value)) {
      return false;
    }
  }

  return hasNonNull;
}

export function dimensionIsExplicitTimeseries({ cols }, i) {
  return (
    isDate(cols[i]) &&
    (cols[i].unit == null || TIMESERIES_UNITS.has(cols[i].unit))
  );
}
