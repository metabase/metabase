import type { ManipulateType } from "dayjs";
import dayjs from "dayjs";
import { t } from "ttag";

import MetabaseSettings from "metabase/lib/settings";
import type { DatetimeUnit } from "metabase-types/api/query";

// Note: Abbreviated locale initialization is now handled in dayjs.ts

const TIME_FORMAT_24_HOUR = "HH:mm";

const TEXT_UNIT_FORMATS = {
  "day-of-week": (value: string) => {
    const day = dayjs.parseZone(value, "ddd").startOf("day");
    return day.isValid() ? day : dayjs.parseZone(value).startOf("day");
  },
};

const NUMERIC_UNIT_FORMATS = {
  // workaround for https://github.com/metabase/metabase/issues/1992
  "minute-of-hour": (value: number) => dayjs().minute(value).startOf("minute"),
  "hour-of-day": (value: number) => dayjs().hour(value).startOf("hour"),
  "day-of-week": (value: number) =>
    dayjs()
      .weekday(value - 1)
      .startOf("day"),
  "day-of-month": (value: number) =>
    dayjs("2016-01-01") // initial date must be in month with 31 days to format properly
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

export function isValidTimeInterval(interval: number, unit: ManipulateType) {
  if (!interval) {
    return false;
  }

  const now = dayjs();
  const newTime = dayjs().add(interval, unit);
  const diff = now.diff(newTime, "year");

  return !Number.isNaN(diff);
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

export function getDateStyleFromSettings() {
  const customFormattingSettings = MetabaseSettings.get("custom-formatting");
  return customFormattingSettings?.["type/Temporal"]?.date_style;
}

export function getRelativeTime(timestamp: string) {
  return dayjs(timestamp).fromNow();
}

export function getRelativeTimeAbbreviated(timestamp: string) {
  const locale = dayjs().locale();

  if (locale === "en") {
    const ts = dayjs(timestamp);
    ts.locale("en-abbreviated");
    return ts.fromNow();
  }

  return getRelativeTime(timestamp);
}

export function getTimeStyleFromSettings() {
  const customFormattingSettings = MetabaseSettings.get("custom-formatting");
  return customFormattingSettings?.["type/Temporal"]?.time_style;
}

export function has24HourModeSetting() {
  const timeStyle = getTimeStyleFromSettings();
  return timeStyle === TIME_FORMAT_24_HOUR;
}

export function hoursToSeconds(hours: number) {
  return hours * 60 * 60;
}

export function msToHours(ms: number) {
  const hours = msToMinutes(ms) / 60;
  return hours;
}

export function msToMinutes(ms: number) {
  return msToSeconds(ms) / 60;
}

export function msToSeconds(ms: number) {
  return ms / 1000;
}

export function parseTime(value: dayjs.Dayjs | string) {
  if (dayjs.isDayjs(value)) {
    return value;
  } else if (typeof value === "string") {
    return dayjs(value, [
      "HH:mm:ss.sss[Z]",
      "HH:mm:SS.sss",
      "HH:mm:SS",
      "HH:mm",
    ]);
  }

  return dayjs.utc(value);
}

type NUMERIC_UNIT_FORMATS_KEY_TYPE =
  | "minute-of-hour"
  | "hour-of-day"
  | "day-of-week"
  | "day-of-month"
  | "day-of-year"
  | "week-of-year"
  | "month-of-year"
  | "quarter-of-year"
  | "year";

// only attempt to parse the timezone if we're sure we have one (either Z or ±hh:mm or +-hhmm)
// moment normally interprets the DD in YYYY-MM-DD as an offset :-/
/**
 * @deprecated use parseTimestamp from ./time-dayjs.ts directly
 */
export function parseTimestamp(
  value: any,
  unit: DatetimeUnit | null = null,
  isLocal = false,
) {
  let m: any;
  if (dayjs.isDayjs(value)) {
    m = value;
  } else if (typeof value === "string" && /(Z|[+-]\d\d:?\d\d)$/.test(value)) {
    m = dayjs.parseZone(value);
  } else if (unit && unit in TEXT_UNIT_FORMATS && typeof value === "string") {
    m = TEXT_UNIT_FORMATS[unit as "day-of-week"](value);
  } else if (unit && unit in NUMERIC_UNIT_FORMATS && typeof value == "number") {
    m = NUMERIC_UNIT_FORMATS[unit as NUMERIC_UNIT_FORMATS_KEY_TYPE](value);
  } else if (typeof value === "number") {
    m = dayjs.utc(value.toString());
  } else {
    m = dayjs.utc(value);
  }
  return isLocal ? m.local() : m;
}
