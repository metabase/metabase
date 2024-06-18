import type { Dayjs } from "dayjs";
import dayjs from "dayjs";

import type { DatetimeUnit } from "metabase-types/api/query";

const DAYLIGHT_SAVINGS_CHANGE_TOLERANCE: Record<string, number> = {
  minute: 0,
  hour: 0,
  // It's not possible to have two consecutive hours or minutes across the
  // daylight savings time change. Daylight savings begins at 2AM on March 10th,
  // so after 1AM, the next hour is 3AM.
  day: 0.05,
  week: 0.01,
  month: 0.01,
  quarter: 0,
  year: 0,
};

/**
 * This function is used to get a tolerance for the difference between two dates
 * across the daylight savings time change, using dayjs' date.diff method.
 */
export function getDaylightSavingsChangeTolerance(unit: string) {
  return unit in DAYLIGHT_SAVINGS_CHANGE_TOLERANCE
    ? DAYLIGHT_SAVINGS_CHANGE_TOLERANCE[unit]
    : 0;
}

const TEXT_UNIT_FORMATS = {
  "day-of-week": (value: string) => {
    const day = dayjs.tz(value, "ddd").startOf("day");
    return day.isValid() ? day : dayjs.tz(value).startOf("day");
  },
};

const NUMERIC_UNIT_FORMATS: Record<string, (value: number) => Dayjs> = {
  "minute-of-hour": (value: number) => dayjs().minute(value).startOf("minute"),
  "hour-of-day": (value: number) => dayjs().hour(value).startOf("hour"),
  "day-of-week": (value: number) =>
    dayjs()
      .weekday(value - 1)
      .startOf("day"),
  "day-of-month": (value: number) =>
    dayjs("2016-01-01").date(value).startOf("day"),
  "day-of-year": (value: number) =>
    dayjs("2016-01-01").dayOfYear(value).startOf("day"),
  "week-of-year": (value: number) => dayjs().week(value).startOf("week"),
  "month-of-year": (value: number) =>
    dayjs()
      .month(value - 1)
      .startOf("month"),
  "quarter-of-year": (value: number) =>
    dayjs().quarter(value).startOf("quarter"),
  year: (value: number) => dayjs().year(value).startOf("year"),
};

// only attempt to parse the timezone if we're sure we have one (either Z or ±hh:mm or +-hhmm)
// moment normally interprets the DD in YYYY-MM-DD as an offset :-/
export function parseTimestamp(
  value: any,
  unit: DatetimeUnit | null = null,
  isLocal = false,
) {
  let result: Dayjs;
  if (dayjs.isDayjs(value)) {
    result = value;
  } else if (typeof value === "string" && /(Z|[+-]\d\d:?\d\d)$/.test(value)) {
    result = dayjs.parseZone(value);
  } else if (unit && unit in TEXT_UNIT_FORMATS && typeof value === "string") {
    result = TEXT_UNIT_FORMATS[unit as "day-of-week"](value);
  } else if (unit && unit in NUMERIC_UNIT_FORMATS && typeof value == "number") {
    result = NUMERIC_UNIT_FORMATS[unit](value);
  } else if (typeof value === "number") {
    result = dayjs.utc(value.toString());
  } else {
    result = dayjs.utc(value);
  }
  return isLocal ? result.local() : result;
}
