import moment from "moment-timezone"; // eslint-disable-line no-restricted-imports -- deprecated usage

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

    if (!moment(value, moment.ISO_8601).isValid()) {
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
