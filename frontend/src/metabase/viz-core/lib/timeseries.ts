import { isDate } from "metabase-lib/v1/types/utils/isa";
import {
  type DatasetData,
  type DatetimeUnit,
  dateTimeAbsoluteUnits,
} from "metabase-types/api";

import { isValidIso8601 } from "./date-validation";

const TIMESERIES_UNITS = new Set<DatetimeUnit>(dateTimeAbsoluteUnits); // https://github.com/metabase/metabase/issues/1992

export function dimensionIsTimeseries({ cols, rows = [] }: DatasetData, i = 0) {
  if (dimensionIsExplicitTimeseries({ cols }, i)) {
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

    if (
      !(typeof value === "number" || typeof value === "string") ||
      !isValidIso8601(value)
    ) {
      return false;
    }
  }

  return hasNonNull;
}

export function dimensionIsExplicitTimeseries(
  { cols }: Pick<DatasetData, "cols">,
  i = 0,
) {
  return (
    isDate(cols[i]) &&
    (cols[i].unit == null || TIMESERIES_UNITS.has(cols[i].unit))
  );
}
