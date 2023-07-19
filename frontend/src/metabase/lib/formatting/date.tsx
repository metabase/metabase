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

type DateVal = string | number | Moment;

interface DateRangeFormatSpec {
  same: null | moment.unitOfTime.StartOf;
  format: [string] | [string, string];
  dashPad?: string;
  test: {
    output: string;
    verboseOutput?: string;
    input: [DateVal] | [DateVal, DateVal];
  };
}

export const DATE_RANGE_FORMAT_SPECS: {
  [unit in DatetimeUnit]: DateRangeFormatSpec[];
} = (() => {
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
      {
        same: "year",
        format: [Y],
        test: { output: "2018", input: ["2018"] },
      },
      {
        same: null,
        format: [Y, Y],
        test: { output: "2018–2019", input: ["2018", "2019"] },
      },
    ],
    quarter: [
      {
        same: "quarter",
        format: [QY],
        test: {
          output: "Q2 2018",
          input: ["2018-04-01"],
        },
      },
      {
        same: "year",
        format: [Q, QY],
        test: {
          output: "Q2–Q4 2018",
          verboseOutput: "Q2 2018 – Q4 2018",
          input: ["2018-04-01", "2018-10-01"],
        },
      },
      {
        same: null,
        format: [QY, QY],
        dashPad: " ",
        test: {
          output: "Q2 2018 – Q3 2019",
          input: ["2018-04-01", "2019-07-01"],
        },
      },
    ],
    "quarter-of-year": [
      {
        same: "quarter",
        format: [Q],
        test: {
          output: "Q2",
          input: ["2018-04-01"],
        },
      },
      {
        same: null,
        format: [Q, Q],
        test: {
          output: "Q2–Q4",
          input: ["2018-04-01", "2018-10-01"],
        },
      },
    ],
    month: [
      {
        same: "month",
        format: [MY],
        test: {
          output: "September 2018",
          input: ["2018-09-01"],
        },
      },
      {
        same: "year",
        format: [M, MY],
        test: {
          output: "September–December 2018",
          verboseOutput: "September 2018 – December 2018",
          input: ["2018-09-01", "2018-12-01"],
        },
      },
      {
        same: null,
        format: [MY, MY],
        dashPad: " ",
        test: {
          output: "September 2018 – January 2019",
          input: ["2018-09-01", "2019-01-01"],
        },
      },
    ],
    "month-of-year": [
      {
        same: "month",
        format: [M],
        test: {
          output: "September",
          input: ["2018-09-01"],
        },
      },
      {
        same: null,
        format: [M, M],
        test: {
          output: "September–December",
          input: ["2018-09-01", "2018-12-01"],
        },
      },
    ],
    week: [
      {
        same: "month",
        format: [MD, DY],
        test: {
          output: "January 1–21, 2017",
          verboseOutput: "January 1, 2017 – January 21, 2017",
          input: ["2017-01-01", "2017-01-15"],
        },
      },
      {
        same: "year",
        format: [MD, MDY],
        dashPad: " ",
        test: {
          output: "January 1 – May 20, 2017",
          verboseOutput: "January 1, 2017 – May 20, 2017",
          input: ["2017-01-01", "2017-05-14"],
        },
      },
      {
        same: null,
        format: [MDY, MDY],
        dashPad: " ",
        test: {
          output: "January 1, 2017 – February 10, 2018",
          input: ["2017-01-01", "2018-02-04"],
        },
      },
    ],
    "week-of-year": [
      {
        same: "week",
        format: [woS],
        test: {
          output: "20th week of the year",
          input: ["2017-05-14"],
        },
      },
      {
        same: null,
        format: ["wo", woP],
        test: {
          output: "34th–40th weeks of the year",
          input: ["2017-08-20", "2017-10-01"],
        },
      },
    ],
    day: [
      {
        same: "day",
        format: [MDY],
        test: {
          output: "January 1, 2018",
          input: ["2018-01-01"],
        },
      },
      {
        same: "month",
        format: [MD, DY],
        test: {
          output: "January 1–2, 2018",
          verboseOutput: "January 1, 2018 – January 2, 2018",
          input: ["2018-01-01", "2018-01-02"],
        },
      },
      {
        same: "year",
        format: [MD, MDY],
        dashPad: " ",
        test: {
          output: "January 1 – February 2, 2018",
          verboseOutput: "January 1, 2018 – February 2, 2018",
          input: ["2018-01-01", "2018-02-02"],
        },
      },
      {
        same: null,
        format: [MDY, MDY],
        dashPad: " ",
        test: {
          output: "January 1, 2018 – February 2, 2019",
          input: ["2018-01-01", "2019-02-02"],
        },
      },
    ],
    "day-of-year": [
      {
        same: "day",
        format: [DDDoS],
        test: {
          output: "123rd day of the year",
          input: ["2017-05-03"],
        },
      },
      {
        same: null,
        format: ["DDDo", DDDoP],
        test: {
          output: "100th–123rd days of the year",
          input: ["2017-04-10", "2017-05-03"],
        },
      },
    ],
    "day-of-month": [
      {
        same: "day",
        format: [DoS],
        test: {
          output: "20th day of the month",
          input: ["2017-02-20"],
        },
      },
      {
        same: null,
        format: ["Do", DoP],
        test: {
          output: "10th–12th days of the month",
          input: ["2017-02-10", "2017-02-12"],
        },
      },
    ],
    "day-of-week": [
      {
        same: "day",
        format: ["dddd"],
        test: {
          output: "Monday",
          input: ["2017-01-02"],
        },
      },
      {
        same: null,
        format: ["dddd", "dddd"],
        dashPad: " ",
        test: {
          output: "Monday – Thursday",
          input: ["2017-01-02", "2017-01-05"],
        },
      },
    ],
    hour: [
      {
        same: "hour",
        format: [MDYT, MA],
        test: {
          output: "January 1, 2018, 11:00–59 AM",
          input: ["2018-01-01T11:00"],
        },
      },
      {
        same: "day",
        format: [MDYTA, TA],
        dashPad: " ",
        test: {
          output: "January 1, 2018, 11:00 AM – 2:59 PM",
          input: ["2018-01-01T11:00", "2018-01-01T14:59"],
        },
      },
      {
        same: "year",
        format: [MDTA, MDYTA],
        dashPad: " ",
        test: {
          output: "January 1, 11:00 AM – February 2, 2018, 2:59 PM",
          input: ["2018-01-01T11:00", "2018-02-02T14:59"],
        },
      },
      {
        same: null,
        format: [MDYTA, MDYTA],
        dashPad: " ",
        test: {
          output: "January 1, 2018, 11:00 AM – February 2, 2019, 2:59 PM",
          input: ["2018-01-01T11:00", "2019-02-02T14:59"],
        },
      },
    ],
    "hour-of-day": [
      {
        same: "hour",
        format: [T, MA],
        test: {
          output: "11:00–59 AM",
          input: ["2018-01-01T11:00"],
        },
      },
      {
        same: null,
        format: [TA, TA],
        dashPad: " ",
        test: {
          output: "11:00 AM – 4:59 PM",
          input: ["2018-01-01T11:00", "2018-01-01T16:00"],
        },
      },
    ],
    minute: [
      {
        same: "minute",
        format: [MDYTA],
        test: {
          output: "January 1, 2018, 11:20 AM",
          input: ["2018-01-01T11:20"],
        },
      },
      {
        same: "day",
        format: [MDYTA, TA],
        dashPad: " ",
        test: {
          output: "January 1, 2018, 11:20 AM – 2:35 PM",
          input: ["2018-01-01T11:20", "2018-01-01T14:35"],
        },
      },
      {
        same: "year",
        format: [MDTA, MDYTA],
        dashPad: " ",
        test: {
          output: "January 1, 11:20 AM – February 2, 2018, 2:35 PM",
          input: ["2018-01-01T11:20", "2018-02-02T14:35"],
        },
      },
      {
        same: null,
        format: [MDYTA, MDYTA],
        dashPad: " ",
        test: {
          output: "January 1, 2018, 11:20 AM – January 2, 2019, 2:35 PM",
          input: ["2018-01-01T11:20", "2019-01-02T14:35"],
        },
      },
    ],
    "minute-of-hour": [
      {
        same: "minute",
        format: [mmS],
        test: {
          output: "minute :05",
          input: ["2018-01-01T11:05"],
        },
      },
      {
        same: null,
        format: [mmP, "mm"],
        test: {
          output: "minutes :05–30",
          input: ["2018-01-01T11:05", "2018-01-01T11:30"],
        },
      },
    ],
  };
})();

export const SPECIFIC_DATE_TIME_UNITS: DatetimeUnit[] = [
  "year",
  "quarter",
  "quarter-of-year",
  "month",
  "month-of-year",
  "week",
  "week-of-year",
  "day",
  "day-of-week",
  "day-of-month",
  "day-of-year",
  "hour",
  "hour-of-day",
  "minute",
  "minute-of-hour",
];

export function genDateRangeTable() {
  const getSpecsRows = (unit: DatetimeUnit) => {
    const specs = DATE_RANGE_FORMAT_SPECS[unit];
    return specs.map(({ same, test: { output } }) => {
      const kind =
        same === unit.split("-")[0]
          ? "single"
          : same
          ? `same ${same}`
          : "otherwise";
      return [`<em>${kind}</em>`, output].map(s => `<td>${s}</td>`);
    });
  };
  const getUnitRows = (unit: DatetimeUnit) => {
    const rows = getSpecsRows(unit);
    rows[0] = [
      `<td valign=top rowspan="${rows.length}"><code>${unit}</code></td>`,
      ...rows[0],
    ];
    return rows.map(cols => ["<tr>", ...cols, "</tr>"].join("\n"));
  };
  const headerRow = ["date unit", "range type", "example"]
    .map(s => `<td><strong>${s}</strong></td>`)
    .join("\n");
  const allRows = SPECIFIC_DATE_TIME_UNITS.map(getUnitRows).flat();
  return ["<table>", headerRow, ...allRows, "</table>"].join("\n");
}

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

export function normalizeDateTimeRangeWithUnit(
  values: [DateVal] | [DateVal, DateVal],
  unit: DatetimeUnit,
  options: OptionsType = {},
) {
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
  values: [DateVal] | [DateVal, DateVal],
  unit: DatetimeUnit,
  options: OptionsType = {},
) {
  const [start, end, shift] = normalizeDateTimeRangeWithUnit(
    values,
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

  const specs = DATE_RANGE_FORMAT_SPECS[unit];
  const defaultSpec = specs.find(spec => spec.same === null);
  const matchSpec =
    specs.find(spec => start.isSame(end, spec.same)) ?? defaultSpec;
  if (!matchSpec || !defaultSpec) {
    return String(start);
  }

  // Even if we don’t have want to condense, we should avoid empty date ranges like Jan 1 - Jan 1.
  // This is indicated when the smallest matched format has no end format.
  if (!matchSpec.format[1]) {
    return formatDate(start, matchSpec.format[0]);
  }

  const {
    format: [startFormat, endFormat],
    dashPad = "",
  } = condensed ? matchSpec : defaultSpec;
  return !endFormat
    ? formatDate(start, startFormat)
    : formatDate(start, startFormat) +
        dashPad +
        EN_DASH +
        dashPad +
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
      return formatDateTimeRangeWithUnit([value], unit, options);
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
