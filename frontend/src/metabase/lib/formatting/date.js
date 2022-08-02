import React from "react";
import moment from "moment-timezone";

import { parseTimestamp } from "metabase/lib/time";
import { isDateWithoutTime } from "metabase/lib/schema_metadata";

const RANGE_SEPARATOR = ` – `;

const DEFAULT_DATE_FORMATS = {
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
const DATE_STYLE_TO_FORMAT = {
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

export const DEFAULT_DATE_STYLE = "MMMM D, YYYY";

const getDayFormat = options =>
  options.compact || options.date_abbreviate ? "ddd" : "dddd";

const getMonthFormat = options =>
  options.compact || options.date_abbreviate ? "MMM" : "MMMM";

export function getDateFormatFromStyle(style, unit, separator) {
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

const UNITS_WITH_HOUR = ["default", "minute", "hour", "hour-of-day"];
const UNITS_WITH_DAY = ["default", "minute", "hour", "day", "week"];

const UNITS_WITH_HOUR_SET = new Set(UNITS_WITH_HOUR);
const UNITS_WITH_DAY_SET = new Set(UNITS_WITH_DAY);

export const hasHour = unit => unit == null || UNITS_WITH_HOUR_SET.has(unit);
export const hasDay = unit => unit == null || UNITS_WITH_DAY_SET.has(unit);

export const DEFAULT_TIME_STYLE = "h:mm A";

export function getTimeFormatFromStyle(style, unit, timeEnabled) {
  const format = style;
  if (!timeEnabled || timeEnabled === "milliseconds") {
    return format.replace(/mm/, "mm:ss.SSS");
  } else if (timeEnabled === "seconds") {
    return format.replace(/mm/, "mm:ss");
  } else {
    return format;
  }
}

export function formatDateTimeForParameter(value, unit) {
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

/** This formats a time with unit as a date range */
export function formatDateTimeRangeWithUnit(value, unit, options = {}) {
  const m = parseTimestamp(value, unit, options.local);
  if (!m.isValid()) {
    return String(value);
  }

  // Tooltips should show full month name, but condense "MMMM D, YYYY - MMMM D, YYYY" to "MMMM D - D, YYYY" etc
  const monthFormat =
    options.type === "tooltip" ? "MMMM" : getMonthFormat(options);
  const condensed = options.compact || options.type === "tooltip";

  // The client's unit boundaries might not line up with the data returned from the server.
  // We shift the range so that the start lines up with the value.
  const start = m.clone().startOf(unit);
  const end = m.clone().endOf(unit);
  const shift = m.diff(start, "days");
  [start, end].forEach(d => d.add(shift, "days"));

  if (start.isValid() && end.isValid()) {
    if (!condensed || start.year() !== end.year()) {
      // January 1, 2018 - January 2, 2019
      return (
        start.format(`${monthFormat} D, YYYY`) +
        RANGE_SEPARATOR +
        end.format(`${monthFormat} D, YYYY`)
      );
    } else if (start.month() !== end.month()) {
      // January 1 - Feburary 2, 2018
      return (
        start.format(`${monthFormat} D`) +
        RANGE_SEPARATOR +
        end.format(`${monthFormat} D, YYYY`)
      );
    } else {
      // January 1 - 2, 2018
      return (
        start.format(`${monthFormat} D`) +
        RANGE_SEPARATOR +
        end.format(`D, YYYY`)
      );
    }
  } else {
    // TODO: when is this used?
    return formatWeek(m, options);
  }
}

export function formatRange(range, formatter, options = {}) {
  const [start, end] = range.map(value => formatter(value, options));
  if ((options.jsx && typeof start !== "string") || typeof end !== "string") {
    return (
      <span>
        {start} {RANGE_SEPARATOR} {end}
      </span>
    );
  } else {
    return `${start} ${RANGE_SEPARATOR} ${end}`;
  }
}

function formatWeek(m, options = {}) {
  return formatMajorMinor(m.format("wo"), m.format("gggg"), options);
}

function formatMajorMinor(major, minor, options = {}) {
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

function replaceDateFormatNames(format, options) {
  return format
    .replace(/\bMMMM\b/g, getMonthFormat(options))
    .replace(/\bdddd\b/g, getDayFormat(options));
}
function formatDateTimeWithFormats(value, dateFormat, timeFormat, options) {
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

export function formatDateTimeWithUnit(value, unit, options = {}) {
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
      options["date_style"],
      unit,
      options["date_separator"],
    );
  }

  if (!timeFormat) {
    timeFormat = getTimeFormatFromStyle(
      options.time_style,
      unit,
      options.time_enabled,
    );
  }

  return formatDateTimeWithFormats(m, dateFormat, timeFormat, options);
}
