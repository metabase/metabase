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
  quarter: "[Q]Q YYYY",
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
    month: "MMMM YYYY",
  },
  "D MMMM, YYYY": {
    month: "MMMM YYYY",
  },
  "dddd, MMMM D, YYYY": {
    week: "MMMM D, YYYY",
    month: "MMMM YYYY",
  },
};

const DATE_RANGE_MONTH_PLACEHOLDER = "<MONTH>";

type SameMatchUnit = moment.unitOfTime.StartOf | null;
type StartFormat = string;
type EndFormat = string | null;
type JoinPad = string;

type DateRangeMatch =
  | [SameMatchUnit, StartFormat]
  | [SameMatchUnit, StartFormat, EndFormat]
  | [SameMatchUnit, StartFormat, EndFormat, JoinPad];

type TestOutput = string;
type TestInputStart = string;
type TestInputEnd = string;
type DateRangeExample =
  | [TestOutput] // TODO: remove this
  | [TestOutput, TestInputStart]
  | [TestOutput, TestInputStart, TestInputEnd];

type DateRangeMatchAndExample = [DateRangeMatch, DateRangeExample];

type DateRangeFormatSpec = {
  [unit in DatetimeUnit]: DateRangeMatchAndExample[];
};

const DATE_RANGE_FORMATS: DateRangeFormatSpec = (() => {
  // dates
  const Y = "YYYY";
  const Q = "[Q]Q";
  const QY = "[Q]Q YYYY";
  const M = DATE_RANGE_MONTH_PLACEHOLDER;
  const MY = `${M} YYYY`;
  const MDY = `${M} D, YYYY`;
  const MD = `${M} D`;
  const DY = "D, YYYY";

  // times
  const T = "h:mm";
  const TA = "h:mm A";
  const MA = "mm A";
  const MDYT = `${MDY}, ${T}`;
  const MDYTA = `${MDY}, ${TA}`;
  const MDTA = `${MD}, ${TA}`;

  // accumulations
  // S = singular, P = plural
  const DDDoS = "DDDo [day of the year]";
  const DDDoP = "DDDo [days of the year]";
  const DoS = "Do [day of the month]";
  const DoP = "Do [days of the month]";
  const woS = "wo [week of the year]";
  const woP = "wo [weeks of the year]";
  const mmS = "[minute] :mm";
  const mmP = "[minutes] :mm";

  return {
    default: [],
    // Use Wikipedia’s date range formatting guidelines for some of these:
    // https://en.wikipedia.org/wiki/Wikipedia:Manual_of_Style/Dates_and_numbers#Ranges
    year: [
      [
        ["year", Y],
        ["2018", "2018"],
      ],
      [
        [null, Y, Y, ""],
        ["2018–2019", "2018", "2019"],
      ],
    ],
    quarter: [
      [["quarter", QY], ["Q2 2018"]],
      [["year", Q, QY, ""], ["Q2–Q4 2019"]],
      [[null, QY, QY, " "], ["Q2 2018 – Q3 2019"]],
    ],
    "quarter-of-year": [
      [["quarter", Q], ["Q2"]],
      [[null, Q, Q, ""], ["Q2–Q4"]],
    ],
    month: [
      [["month", MY], ["September 2018"]],
      [["year", M, MY], ["September–December 2018"]],
      [[null, MY, MY, " "], ["September 2018 – January 2019"]],
    ],
    "month-of-year": [
      [["month", M], ["September"]],
      [[null, M, M, " "], ["September–December"]],
    ],
    week: [
      [["month", MD, DY], ["January 1–21, 2017"]],
      [["year", MD, MDY, " "], ["January 1 – May 20, 2017"]],
      [[null, MDY, MDY, " "], ["January 1, 2017 – February 10, 2018"]],
    ],
    "week-of-year": [
      [["week", woS], ["20th week of the year"]],
      [[null, "wo", woP], ["34th-40th weeks of the year"]],
    ],
    day: [
      [["day", MDY], ["January 1, 2018"]],
      [["month", MD, DY], ["January 1–2, 2018"]],
      [["year", MD, MDY, " "], ["January 1 – February 2, 2018"]],
      [[null, MDY, MDY, " "], ["January 1, 2018 – January 2, 2019"]],
    ],
    "day-of-year": [
      [["day", DDDoS], ["123rd day of the year"]],
      [[null, "DDDo", DDDoP], ["100th–123rd days of the year"]],
    ],
    "day-of-month": [
      [["day", DoS], ["20th day of the month"]],
      [[null, "Do", DoP], ["10th–12th days of the month"]],
    ],
    "day-of-week": [
      [["day", "dddd"], ["Monday"]],
      [[null, "dddd", "dddd", " "], ["Monday – Thursday"]],
    ],
    hour: [
      [["hour", MDYT, MA], ["January 1, 2018, 11:00–59 AM"]],
      [["day", MDYTA, TA, " "], ["January 1, 2018, 11:00 AM – 2:59 PM"]],
      [
        ["year", MDTA, MDYTA, " "],
        ["January 1, 11:00 AM – February 2, 2018, 2:59 PM"],
      ],
      [
        [null, MDYTA, MDYTA, " "],
        ["January 1, 2018, 11:00 AM – January 2, 2019, 2:59 PM"],
      ],
    ],
    "hour-of-day": [
      [["hour", T, MA], ["11:00–59 AM"]],
      [[null, TA, TA, " "], ["11:00 AM – 4:59 PM"]],
    ],
    minute: [
      [["minute", MDYTA], ["January 1, 2018, 11:20 AM"]],
      [["day", MDYTA, TA, " "], ["January 1, 2018, 11:20 AM – 2:35 PM"]],
      [
        ["year", MDTA, MDYTA, " "],
        ["January 1, 11:20 AM – February 2, 2018, 2:35 PM"],
      ],
      [
        [null, MDYTA, MDYTA, " "],
        ["January 1, 2018, 11:20 AM – January 2, 2019, 2:35 PM"],
      ],
    ],
    "minute-of-hour": [
      [["minute", mmS], ["minute :05"]],
      [[null, mmP, "mm"], ["minutes :05–30"]],
    ],
  };
})();

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

type DateVal = string | number | Moment;

export function normalizeDateTimeRangeWithUnit(
  value: DateVal | [DateVal] | [DateVal, DateVal],
  unit: DatetimeUnit,
  options: OptionsType = {},
) {
  const values = Array.isArray(value) ? value : [value];
  const [a, b] = [values[0], values[1] ?? values[0]].map(d =>
    parseTimestamp(d, unit, options.local),
  );
  if (!a.isValid() || !b.isValid()) {
    return [a, b];
  }

  // week-of-year → week, minute-of-hour → minute, etc
  const momentUnit = unit.split("-")[0];

  // The client's unit boundaries might not line up with the data returned from the server.
  // We shift the range so that the start lines up with the value.
  const start = a.clone().startOf(momentUnit);
  const end = b.clone().endOf(momentUnit);
  const shift = a.diff(start, "days");
  [start, end].forEach(d => d.add(shift, "days"));
  return [start, end, shift];
}

/** This formats a time with unit as a date range */
export function formatDateTimeRangeWithUnit(
  value: DateVal | [DateVal] | [DateVal, DateVal],
  unit: DatetimeUnit,
  options: OptionsType = {},
) {
  const [start, end, shift] = normalizeDateTimeRangeWithUnit(
    value,
    unit,
    options,
  );
  if (shift === undefined) {
    return String(start);
  } else if (!start.isValid() || !end.isValid()) {
    // TODO: when is this used?
    return formatWeek(start, options);
  }

  // Tooltips should show full month name, but condense "MMMM D, YYYY - MMMM D, YYYY" to "MMMM D-D, YYYY" etc
  const monthFormat =
    options.type === "tooltip" ? "MMMM" : getMonthFormat(options);
  const condensed = options.compact || options.type === "tooltip";

  // month format is configurable, so we need to insert it after lookup
  const formatDate = (date: Moment, formatStr: string) =>
    date.format(formatStr.replace(DATE_RANGE_MONTH_PLACEHOLDER, monthFormat));

  const formats = DATE_RANGE_FORMATS[unit];
  const largestFormat = formats.find(([[matchUnit]]) => matchUnit == null);
  const smallestFormat =
    formats.find(([[matchUnit]]) => start.isSame(end, matchUnit)) ??
    largestFormat;
  if (!smallestFormat || !largestFormat) {
    return String(start);
  }

  // Even if we don’t have want to condense, we should avoid empty date ranges like Jan 1 - Jan 1.
  // This is indicated when the smallest matched format has no end format.
  let [[_, startFormat, endFormat, pad]] = smallestFormat;
  if (!endFormat) {
    return formatDate(start, startFormat);
  }

  [[_, startFormat, endFormat, pad = ""]] = condensed
    ? smallestFormat
    : largestFormat;
  return !endFormat
    ? formatDate(start, startFormat)
    : formatDate(start, startFormat) +
        pad +
        EN_DASH +
        pad +
        formatDate(end, endFormat);
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
