import type { Dayjs } from "dayjs";
import dayjs from "dayjs";
import { t } from "ttag";

import MetabaseSettings from "metabase/lib/settings";
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
  } else if (typeof value === "string" && /^\d{4}-W\d{2}$/.test(value)) {
    // Parse ISO week format (e.g., "2019-W33")
    const match = value.match(/^(\d{4})-W(\d{2})$/);
    if (match) {
      const year = parseInt(match[1], 10);
      const week = parseInt(match[2], 10);
      // Validate week number (ISO weeks range from 1-53, most years have 52)
      if (week >= 1 && week <= 53) {
        // ISO week 1 is the week that contains January 4th
        // Calculate the Monday of week 1
        const jan4 = dayjs.utc().year(year).month(0).date(4);
        const mondayOfWeek1 = jan4.startOf("isoWeek");
        result = mondayOfWeek1.add(week - 1, "week");
      } else {
        result = dayjs.utc(value); // will be invalid
      }
    } else {
      result = dayjs.utc(value);
    }
  } else if (typeof value === "string" && /(Z|[+-]\d\d:?\d\d)$/.test(value)) {
    result = dayjs.parseZone(value);
  } else if (unit && unit in TEXT_UNIT_FORMATS && typeof value === "string") {
    result = TEXT_UNIT_FORMATS[unit as "day-of-week"](value);
  } else if (unit && unit in NUMERIC_UNIT_FORMATS && typeof value == "number") {
    result = NUMERIC_UNIT_FORMATS[unit](value);
  } else if (typeof value === "number") {
    // When a unit is provided but not in NUMERIC_UNIT_FORMATS, small numbers
    // don't make sense as timestamps. For example, parseTimestamp(1, "month")
    // should not interpret 1 as "1 millisecond since epoch".
    // Use strict parsing for small numbers to return invalid dates.
    if (unit && value < 1000) {
      result = dayjs.utc(value, "", true);
    } else {
      result = dayjs.utc(value.toString());
    }
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
  // Use a fixed date in winter (non-DST) to get consistent offsets
  return dayjs("2024-07-01").tz(timezone).format("Z");
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

function getTimeStyleFromSettings() {
  const customFormattingSettings = MetabaseSettings.get("custom-formatting");
  return customFormattingSettings?.["type/Temporal"]?.time_style;
}

const TIME_FORMAT_24_HOUR = "HH:mm";

export function has24HourModeSetting() {
  const timeStyle = getTimeStyleFromSettings();
  return timeStyle === TIME_FORMAT_24_HOUR;
}
