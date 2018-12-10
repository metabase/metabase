/* @flow */

import type { DateSeparator } from "metabase/lib/formatting";

import type { DatetimeUnit } from "metabase/meta/types/Query";

export type DateStyle =
  | "M/D/YYYY"
  | "D/M/YYYY"
  | "YYYY/M/D"
  | "MMMM D, YYYY"
  | "MMMM D, YYYY"
  | "D MMMM, YYYY"
  | "dddd, MMMM D, YYYY";

export type TimeStyle = "h:mm A" | "k:mm";

export type MomentFormat = string; // moment.js format strings
export type DateFormat = MomentFormat;
export type TimeFormat = MomentFormat;

export type TimeEnabled = null | "minutes" | "seconds" | "milliseconds";

const DEFAULT_DATE_FORMATS: { [unit: DatetimeUnit]: MomentFormat } = {
  year: "YYYY",
  quarter: "[Q]Q - YYYY",
  "minute-of-hour": "m",
  "hour-of-day": "h A",
  "day-of-week": "dddd",
  "day-of-month": "D",
  "day-of-year": "DDD",
  "week-of-year": "wo",
  "month-of-year": "MMMM",
  "quarter-of-year": "[Q]Q",
};

// a "date style" is essentially a "day" format with overrides for larger units
const DATE_STYLE_TO_FORMAT: {
  [style: DateStyle]: { [unit: DatetimeUnit]: MomentFormat },
} = {
  "M/D/YYYY": {
    month: "M/YYYY",
  },
  "D/M/YYYY": {
    month: "M/YYYY",
  },
  "YYYY/M/D": {
    month: "YYYY/M",
    quarter: "YYYY - [Q]Q",
  },
  "MMMM D, YYYY": {
    month: "MMMM, YYYY",
  },
  "D MMMM, YYYY": {
    month: "MMMM, YYYY",
  },
  "dddd, MMMM D, YYYY": {
    week: "MMMM D, YYYY",
    month: "MMMM, YYYY",
  },
};

export const DEFAULT_DATE_STYLE: DateStyle = "MMMM D, YYYY";

export function getDateFormatFromStyle(
  style: DateStyle,
  unit: ?DatetimeUnit,
  separator?: DateSeparator,
): DateFormat {
  const replaceSeparators = format =>
    separator && format ? format.replace(/\//g, separator) : format;

  if (!unit) {
    unit = "default";
  }
  if (DATE_STYLE_TO_FORMAT[style]) {
    if (DATE_STYLE_TO_FORMAT[style][unit]) {
      return replaceSeparators(DATE_STYLE_TO_FORMAT[style][unit]);
    }
  } else {
    console.warn("Unknown date style", style);
  }
  if (DEFAULT_DATE_FORMATS[unit]) {
    return replaceSeparators(DEFAULT_DATE_FORMATS[unit]);
  }
  return replaceSeparators(style);
}

const UNITS_WITH_HOUR: DatetimeUnit[] = ["default", "minute", "hour"];
const UNITS_WITH_DAY: DatetimeUnit[] = [
  "default",
  "minute",
  "hour",
  "day",
  "week",
];

const UNITS_WITH_HOUR_SET = new Set(UNITS_WITH_HOUR);
const UNITS_WITH_DAY_SET = new Set(UNITS_WITH_DAY);

export const hasHour = (unit: ?DatetimeUnit) =>
  unit == null || UNITS_WITH_HOUR_SET.has(unit);
export const hasDay = (unit: ?DatetimeUnit) =>
  unit == null || UNITS_WITH_DAY_SET.has(unit);

export const DEFAULT_TIME_STYLE: TimeStyle = "h:mm A";

export function getTimeFormatFromStyle(
  style: TimeStyle,
  unit: DatetimeUnit,
  timeEnabled: ?TimeEnabled,
): TimeFormat {
  let format = style;
  if (!timeEnabled || timeEnabled === "milliseconds") {
    return format.replace(/mm/, "mm:ss.SSS");
  } else if (timeEnabled === "seconds") {
    return format.replace(/mm/, "mm:ss");
  } else {
    return format;
  }
}
