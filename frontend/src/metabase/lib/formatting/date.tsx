import moment, { Moment } from "moment-timezone";

import { parseTimestamp } from "metabase/lib/time";
import type { DatetimeUnit } from "metabase-types/api/query";
import { isDateWithoutTime } from "metabase-lib/types/utils/isa";
import {
  DEFAULT_DATE_STYLE,
  DEFAULT_TIME_STYLE,
  getTimeFormatFromStyle,
  hasDay,
  hasHour,
} from "./datetime-utils";

import type { OptionsType } from "./types";

const EN_DASH = `–`;

type DEFAULT_DATE_FORMATS_TYPE = { [key: string]: string };
const DEFAULT_DATE_FORMATS: DEFAULT_DATE_FORMATS_TYPE = {
  year: "YYYY",
  quarter: "[Q]Q - YYYY",
  "minute-of-hour": "m",
  "day-of-week": "dddd",
  "day-of-month": "D",
  "day-of-year": "DDD",
  "week-of-year": "wo",
  "month-of-year": "MMMM",
  "quarter-of-year": "[Q]Q",
};

// a "date style" is essentially a "day" format with overrides for larger units

type DATE_STYLE_TO_FORMAT_TYPE = { [key: string]: { [key: string]: string } };

const DATE_STYLE_TO_FORMAT: DATE_STYLE_TO_FORMAT_TYPE = {
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

const getDayFormat = (options: OptionsType) =>
  options.compact || options.date_abbreviate ? "ddd" : "dddd";

const getMonthFormat = (options: OptionsType) =>
  options.compact || options.date_abbreviate ? "MMM" : "MMMM";

export function getDateFormatFromStyle(
  style: string,
  unit: DatetimeUnit,
  separator: string,
  includeWeekday?: boolean,
) {
  const replaceSeparators = (format: string) =>
    separator && format ? format.replace(/\//g, separator) : format;

  if (!unit) {
    unit = "default";
  }

  let format = null;

  if (DATE_STYLE_TO_FORMAT[style]) {
    if (DATE_STYLE_TO_FORMAT[style][unit]) {
      format = replaceSeparators(DATE_STYLE_TO_FORMAT[style][unit]);
    }
  } else {
    console.warn("Unknown date style", style);
  }

  if (format == null) {
    format = DEFAULT_DATE_FORMATS[unit]
      ? replaceSeparators(DEFAULT_DATE_FORMATS[unit])
      : replaceSeparators(style);
  }

  if (includeWeekday && hasDay(unit)) {
    format = `ddd, ${format}`;
  }

  return format;
}

export function formatDateTimeForParameter(value: string, unit: DatetimeUnit) {
  const m = parseTimestamp(value, unit);
  if (!m.isValid()) {
    return String(value);
  }

  if (unit === "month") {
    return m.format("YYYY-MM");
  } else if (unit === "quarter") {
    return m.format("[Q]Q-YYYY");
  } else if (unit === "day") {
    return m.format("YYYY-MM-DD");
  } else if (unit) {
    const start = m.clone().startOf(unit);
    const end = m.clone().endOf(unit);

    if (!start.isValid() || !end.isValid()) {
      return String(value);
    }

    const isSameDay = start.isSame(end, "day");

    return isSameDay
      ? start.format("YYYY-MM-DD")
      : `${start.format("YYYY-MM-DD")}~${end.format("YYYY-MM-DD")}`;
  }
}

type DateVal = string | number;

/** This formats a time with unit as a date range */
export function formatDateTimeRangeWithUnit(
  value: DateVal | [DateVal] | [DateVal, DateVal],
  unit: DatetimeUnit,
  options: OptionsType = {},
) {
  const values = Array.isArray(value) ? value : [value];
  const [a, b] = [values[0], values[1] ?? values[0]].map(d =>
    parseTimestamp(d, unit, options.local),
  );
  if (!a.isValid() || !b.isValid()) {
    return String(a);
  }

  // The client's unit boundaries might not line up with the data returned from the server.
  // We shift the range so that the start lines up with the value.
  const start = a.clone().startOf(unit);
  const end = b.clone().endOf(unit);
  const shift = a.diff(start, "days");
  [start, end].forEach(d => d.add(shift, "days"));

  if (!start.isValid() || !end.isValid()) {
    // TODO: when is this used?
    return formatWeek(a, options);
  }

  // Tooltips should show full month name, but condense "MMMM D, YYYY - MMMM D, YYYY" to "MMMM D - D, YYYY" etc
  const monthFormat =
    options.type === "tooltip" ? "MMMM" : getMonthFormat(options);
  const condensed = options.compact || options.type === "tooltip";

  const sameYear = start.year() === end.year();
  const sameQuarter = start.quarter() === end.quarter();
  const sameMonth = start.month() === end.month();
  const sameDayOfMonth = start.date() === end.date();

  const Y = "YYYY";
  const Q = "[Q]Q";
  const QY = "[Q]Q YYYY";
  const M = monthFormat;
  const MY = `${monthFormat} YYYY`;
  const MDY = `${monthFormat} D, YYYY`;
  const MD = `${monthFormat} D`;
  const DY = `D, YYYY`;

  // Drop down to day resolution if shift causes misalignment with desired resolution boundaries
  const date_resolution =
    (shift === 0 ? options.date_resolution : null) ?? "day";

  // Use Wikipedia’s date range formatting guidelines
  // https://en.wikipedia.org/wiki/Wikipedia:Manual_of_Style/Dates_and_numbers#Ranges
  const [startFormat, endFormat, pad = ""] = {
    year:
      !sameYear || !condensed
        ? [Y, Y] // 2018–2019
        : [Y], // 2018
    quarter:
      !sameYear || !condensed
        ? [QY, QY, " "] // Q2 2018 – Q3 2019
        : !sameQuarter
        ? [Q, QY] // Q2–Q4 2019
        : [QY], // Q2 2018
    month:
      !sameYear || !condensed
        ? [MY, MY, " "] // September 2018 – January 2019
        : !sameMonth
        ? [M, MY] // September–December 2018
        : [MY], // September 2018
    day:
      !sameYear || !condensed
        ? [MDY, MDY, " "] // January 1, 2018 – January 2, 2019
        : !sameMonth
        ? [MD, MDY, " "] // January 1 – February 2, 2018
        : !sameDayOfMonth
        ? [MD, DY] // January 1–2, 2018
        : [MDY], // January 1, 2018
  }[date_resolution];

  const startStr = start.format(startFormat);
  const endStr = end.format(endFormat ?? startFormat);
  return startStr === endStr
    ? startStr
    : startStr + pad + EN_DASH + pad + endStr;
}

export function formatRange(
  range: any[],
  formatter: any,
  options: OptionsType = {},
) {
  const [start, end] = range.map(value => formatter(value, options));
  if ((options.jsx && typeof start !== "string") || typeof end !== "string") {
    return (
      <span>
        {start} {EN_DASH} {end}
      </span>
    );
  } else {
    return `${start}  ${EN_DASH}  ${end}`;
  }
}

function formatWeek(m: Moment, options: OptionsType = {}) {
  return formatMajorMinor(m.format("wo"), m.format("gggg"), options);
}

function formatMajorMinor(
  major: string,
  minor: string,
  options: OptionsType = {},
) {
  options = {
    jsx: false,
    majorWidth: 3,
    ...options,
  };
  if (options.jsx) {
    return (
      <span>
        <span
          style={{ minWidth: options.majorWidth + "em" }}
          className="inline-block text-right text-bold"
        >
          {major}
        </span>
        {" - "}
        <span>{minor}</span>
      </span>
    );
  } else {
    return `${major} - ${minor}`;
  }
}

function replaceDateFormatNames(format: string, options: OptionsType) {
  return format
    .replace(/\bMMMM\b/g, getMonthFormat(options))
    .replace(/\bdddd\b/g, getDayFormat(options));
}

function formatDateTimeWithFormats(
  value: number,
  dateFormat: string,
  timeFormat: string,
  options: OptionsType,
) {
  const m = parseTimestamp(
    value,
    options.column && options.column.unit,
    options.local,
  );
  if (!m.isValid()) {
    return String(value);
  }

  const format = [];
  if (dateFormat) {
    format.push(replaceDateFormatNames(dateFormat, options));
  }

  const shouldIncludeTime =
    timeFormat && options.time_enabled && !isDateWithoutTime(options.column);

  if (shouldIncludeTime) {
    format.push(timeFormat);
  }
  return m.format(format.join(", "));
}

export function formatDateTimeWithUnit(
  value: number | string,
  unit: DatetimeUnit,
  options: OptionsType = {},
) {
  if (options.isExclude && unit === "hour-of-day") {
    return moment.utc(value).format("h A");
  } else if (options.isExclude && unit === "day-of-week") {
    const date = moment.utc(value);
    if (date.isValid()) {
      return date.format("dddd");
    }
  }

  const m = parseTimestamp(value, unit, options.local);
  if (!m.isValid()) {
    return String(value);
  }

  // expand "week" into a range in specific contexts
  if (unit === "week") {
    if (
      (options.type === "tooltip" || options.type === "cell") &&
      !options.noRange
    ) {
      // tooltip show range like "January 1 - 7, 2017"
      return formatDateTimeRangeWithUnit(value, unit, options);
    }
  }

  options = {
    date_style: DEFAULT_DATE_STYLE,
    time_style: DEFAULT_TIME_STYLE,
    time_enabled: hasHour(unit) ? "minutes" : null,
    ...options,
  };

  let dateFormat = options.date_format;
  let timeFormat = options.time_format;

  if (!dateFormat) {
    dateFormat = getDateFormatFromStyle(
      options.date_style as string,
      unit,
      options.date_separator as string,
      options.weekday_enabled,
    );
  }

  if (!timeFormat) {
    timeFormat = getTimeFormatFromStyle(
      options.time_style as string,
      unit,
      options.time_enabled,
    );
  }

  return formatDateTimeWithFormats(m, dateFormat, timeFormat, options);
}
