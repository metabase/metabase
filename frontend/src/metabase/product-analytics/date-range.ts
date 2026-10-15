import { dayjs } from "metabase/dayjs";
import type { DatePickerValue } from "metabase/querying/common/types";
import {
  deserializeDateParameterValue,
  serializeDateParameterValue,
} from "metabase/querying/parameters/utils/parsing";

import { PROTOTYPE_RANGE_DAYS } from "./config";
import type { Granularity } from "./spec/types";

/*
 * Date ranges are stored in the dashboard date-filter format ("past90days"),
 * because a DatePickerValue holds Date objects that don't survive JSON.
 */

export const serializeDateRange = (value: DatePickerValue): string =>
  serializeDateParameterValue(value);

export const parseDateRange = (value: string): DatePickerValue | undefined => {
  const parsed = deserializeDateParameterValue(value);
  if (parsed === null || parsed.type === "month" || parsed.type === "quarter") {
    return undefined;
  }
  return parsed;
};

const getDateRangeBounds = (
  value: DatePickerValue,
): [dayjs.Dayjs, dayjs.Dayjs] | undefined => {
  switch (value.type) {
    case "relative": {
      const now = dayjs();
      const span = Math.max(Math.abs(value.value), 1);
      return value.value < 0
        ? [now.subtract(span, value.unit), now]
        : [now, now.add(span, value.unit)];
    }
    case "specific": {
      const [first, second] = value.values;
      if (first === undefined) {
        return undefined;
      }
      switch (value.operator) {
        case "=":
          return [dayjs(first), dayjs(first).add(1, "day")];
        case "between":
          return second === undefined
            ? undefined
            : [dayjs(first), dayjs(second).add(1, "day")];
        default:
          return undefined;
      }
    }
    case "exclude":
      return undefined;
  }
};

/**
 * How many `granularity` periods the stored date range spans, or undefined
 * when the range is open-ended.
 */
export const countPeriodsInDateRange = (
  value: string,
  granularity: Granularity,
): number | undefined => {
  const parsed = parseDateRange(value);
  const bounds = parsed === undefined ? undefined : getDateRangeBounds(parsed);
  if (bounds === undefined) {
    return undefined;
  }
  const [start, end] = bounds;
  return Math.max(1, Math.ceil(end.diff(start, granularity, true)));
};

export const DEFAULT_DATE_RANGE = serializeDateRange({
  type: "relative",
  value: -PROTOTYPE_RANGE_DAYS,
  unit: "day",
});
