import { dayjs } from "metabase/dayjs";
import type {
  DatePickerValue,
  RelativeDatePickerValue,
  SpecificDatePickerValue,
} from "metabase/querying/common/types";
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

/** The fewest days each relative-range unit can span, so widening by whole units never falls short. */
const MIN_DAYS_PER_UNIT: Record<RelativeDatePickerValue["unit"], number> = {
  minute: 1 / (24 * 60),
  hour: 1 / 24,
  day: 1,
  week: 7,
  month: 28,
  quarter: 89,
  year: 365,
};

const widenRelativeRange = (
  value: RelativeDatePickerValue,
  days: number,
): RelativeDatePickerValue => {
  const extra = Math.ceil(days / MIN_DAYS_PER_UNIT[value.unit]);
  if (value.value < 0) {
    return { ...value, value: value.value - extra };
  }
  // "This week": the past units before it, and the current one.
  return value.value === 0
    ? {
        ...value,
        value: -extra,
        options: { ...value.options, includeCurrent: true },
      }
    : value;
};

const widenSpecificRange = (
  value: SpecificDatePickerValue,
  days: number,
): SpecificDatePickerValue => {
  const [first, second] = value.values;
  if (first === undefined) {
    return value;
  }
  const start = dayjs(first).subtract(days, "day").toDate();
  switch (value.operator) {
    case "=":
      return { ...value, operator: "between", values: [start, first] };
    case "between":
      return second === undefined
        ? value
        : { ...value, values: [start, second] };
    case ">":
      return { ...value, values: [start] };
    case "<":
      return value;
  }
};

/**
 * The range starting at least `days` earlier and ending at the same time.
 * Relative ranges grow by whole units, so they may start earlier still. A
 * range with no start, or one in the future, is returned as is.
 */
export const widenDateRange = (
  value: DatePickerValue,
  days: number,
): DatePickerValue => {
  switch (value.type) {
    case "relative":
      return widenRelativeRange(value, days);
    case "specific":
      return widenSpecificRange(value, days);
    case "exclude":
      return value;
  }
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
