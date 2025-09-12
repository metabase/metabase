import dayjs from "dayjs";

import { isDate } from "metabase-lib/v1/types/utils/isa";

function isValidISO8601(value) {
  const stringifiedDate = String(value);

  // Handle numeric values (both numbers and pure numeric strings)
  if (typeof value === "number" || /^\d+$/.test(stringifiedDate)) {
    // Only accept 4, 6, or 8 digit patterns (YYYY, YYYYMM, YYYYMMDD)
    if (![4, 6, 8].includes(stringifiedDate.length)) {
      return false;
    }

    // Parse using dayjs and validate the result matches expected format
    const year = stringifiedDate.substring(0, 4);
    const month =
      stringifiedDate.length >= 6 ? stringifiedDate.substring(4, 6) : "01";
    const day =
      stringifiedDate.length === 8 ? stringifiedDate.substring(6, 8) : "01";
    const formatted = `${year}-${month}-${day}`;

    const parsed = dayjs(formatted);
    return parsed.isValid() && parsed.format("YYYY-MM-DD") === formatted;
  }

  // Handle special ISO 8601 formats that dayjs doesn't parse natively
  if (
    stringifiedDate.includes("-W") ||
    /^\d{4}-\d{3}$/.test(stringifiedDate) ||
    /^\d{8}T\d{6}Z$/.test(stringifiedDate)
  ) {
    // Week formats (YYYY-W##, YYYY-W##-#), ordinal dates (YYYY-DDD), compact ISO (YYYYMMDDTHHMMSSZ)
    return (
      /^\d{4}-(W\d{2}(-\d)?|\d{3})$/.test(stringifiedDate) ||
      /^\d{8}T\d{6}Z$/.test(stringifiedDate)
    );
  }

  // Use dayjs for standard parsing, but be more strict about accepted formats
  // Only allow formats that look like dates/times with proper separators
  if (
    !/^\d{4}-\d{2}-\d{2}($|[ T]\d{2}:\d{2}:\d{2}(\.\d{3})?([+-]\d{2}:\d{2}|Z)?)/.test(
      stringifiedDate,
    )
  ) {
    return false;
  }

  const parsed = dayjs(stringifiedDate);
  if (!parsed.isValid()) {
    return false;
  }

  return true;
}

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
