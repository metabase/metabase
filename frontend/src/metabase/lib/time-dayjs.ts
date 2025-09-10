import type { Dayjs } from "dayjs";
import dayjs from "dayjs";
import { t } from "ttag";

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

// Map 3-letter day abbreviations to day numbers (0 = Sunday, 6 = Saturday)
const DAY_MAP: Record<string, number> = {
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
};

const TEXT_UNIT_FORMATS = {
  "day-of-week": (value: string) => {
    const dayNumber = DAY_MAP[value.toLowerCase()];
    if (dayNumber !== undefined) {
      return dayjs().weekday(dayNumber).startOf("day");
    }

    const day = dayjs(value, "ddd").startOf("day");
    return day.isValid() ? day : dayjs(value).startOf("day");
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
    dayjs("2016-01-01") // initial date must be in leap year to format properly
      .date(value)
      .startOf("day"),
  "day-of-year": (value: number) =>
    dayjs("2016-01-01") // initial date must be in leap year to format properly
      .dayOfYear(value)
      .startOf("day"),
  "week-of-year": (value: number) =>
    dayjs("2016-01-01") // initial date must be in a year with 53 iso weeks to format properly
      .isoWeek(value) // set the iso week number to not depend on the first day of week
      .startOf("isoWeek"),
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
  } else if (typeof value === "string" && /^\d{4}-W\d{1,2}$/.test(value)) {
    // Handle ISO week format like "2019-W33"
    const [year, week] = value.split("-W").map(Number);
    const weekResult = dayjs.utc().year(year).isoWeek(week).startOf("isoWeek");
    // Validate that the week number is valid (typically 1-53)
    if (weekResult.isValid() && weekResult.isoWeek() === week) {
      result = weekResult;
    } else {
      result = dayjs.utc(value); // fallback to default parsing
    }
  } else if (typeof value === "number") {
    // use strict parsing to bypass small numbers like 1
    result = dayjs.utc(value, "", true);
  } else {
    result = dayjs.utc(value);
  }
  return isLocal ? result.local() : result;
}

export function getRelativeTime(timestamp: string) {
  return dayjs(timestamp).fromNow();
}

export function formatFrame(frame: "first" | "last" | "mid") {
  switch (frame) {
    case "first":
      return t`first`;
    case "last":
      return t`last`;
    case "mid":
      return t`15th (Midpoint)`;
    default:
      return frame;
  }
}

export function timezoneToUTCOffset(timezone: string) {
  return dayjs().tz(timezone).format("Z");
}

export function parseTime(value: Dayjs | string) {
  if (dayjs.isDayjs(value)) {
    return value;
  } else if (typeof value === "string") {
    // removing the timezone part if it exists, so we can parse the time correctly
    return dayjs(value.split(/[+-]/)[0], [
      "HH:mm:ss.SSSZ",
      "HH:mm:ss.SSS",
      "HH:mm:ss",
      "HH:mm",
    ]);
  }

  return dayjs.utc(value);
}
