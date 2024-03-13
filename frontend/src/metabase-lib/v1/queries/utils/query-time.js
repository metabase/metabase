import { assoc } from "icepick";
import moment from "moment-timezone"; // eslint-disable-line no-restricted-imports -- deprecated usage
import { t, ngettext, msgid } from "ttag";
import _ from "underscore";

import { formatDateTimeWithUnit } from "metabase/lib/formatting";
import { parseTimestamp } from "metabase/lib/time";
import * as Lib from "metabase-lib";
import { FieldDimension } from "metabase-lib/v1/Dimension";

export const DATETIME_UNITS = [
  "minute",
  "hour",
  "day",
  "week",
  "month",
  "quarter",
  "year",
  "hour-of-day",
  "day-of-week",
  "day-of-month",
  "week-of-year",
  "month-of-year",
  "quarter-of-year",
];

export function computeFilterTimeRange(filter) {
  let expandedFilter;
  let defaultUnit;
  if (filter[0] === "time-interval") {
    defaultUnit = filter[3];
    expandedFilter = expandTimeIntervalFilter(filter);
  } else {
    expandedFilter = filter;
  }

  const [operator, field, ...values] = expandedFilter;
  const bucketing = parseFieldBucketing(field, defaultUnit ?? "day");

  let start, end;
  if (isStartingFrom(filter)) {
    const [startingFrom, startingFromUnit] = getStartingFrom(filter);
    const [value, unit] = getRelativeDatetimeInterval(filter);
    const now = moment().startOf(unit).add(-startingFrom, startingFromUnit);
    start = now.clone().add(value < 0 ? value : 0, unit);
    end = now.clone().add(value < 0 ? 0 : value, unit);
    if (["day", "week", "month", "quarter", "year"].indexOf(unit) > -1) {
      end = end.add(-1, "day");
    }
  } else if (operator === "=" && values[0]) {
    const point = absolute(values[0]);
    start = point.clone().startOf(bucketing);
    end = point.clone().endOf(bucketing);
  } else if (operator === ">" && values[0]) {
    start = absolute(values[0]).endOf(bucketing);
    end = max();
  } else if (operator === "<" && values[0]) {
    start = min();
    end = absolute(values[0]).startOf(bucketing);
  } else if (operator === "between" && values[0] && values[1]) {
    start = absolute(values[0]).startOf(bucketing);
    end = absolute(values[1]).endOf(bucketing);
  }

  return [start, end];
}

export function expandTimeIntervalFilter(filter) {
  let [operator, field, n, unit, options] = filter;
  const includeCurrent = !!options?.["include-current"];

  if (operator !== "time-interval") {
    throw new Error("translateTimeInterval expects operator 'time-interval'");
  }

  if (n === "current") {
    n = 0;
  } else if (n === "last") {
    n = -1;
  } else if (n === "next") {
    n = 1;
  }

  const dimension = FieldDimension.parseMBQLOrWarn(field);
  if (dimension) {
    field = dimension.withTemporalUnit(unit).mbql();
  }

  if (n < -1) {
    return [
      "between",
      field,
      ["relative-datetime", n, unit],
      ["relative-datetime", includeCurrent ? 0 : -1, unit],
    ];
  } else if (n > 1) {
    return [
      "between",
      field,
      ["relative-datetime", includeCurrent ? 0 : 1, unit],
      ["relative-datetime", n, unit],
    ];
  } else if (n === 0) {
    return ["=", field, ["relative-datetime", "current"]];
  } else if (includeCurrent) {
    return [
      "between",
      field,
      ["relative-datetime", n < 0 ? n : 0, unit],
      ["relative-datetime", n < 0 ? 0 : n, unit],
    ];
  } else {
    return ["=", field, ["relative-datetime", n, unit]];
  }
}

export function generateTimeFilterValuesDescriptions(filter) {
  const [operator, field, ...values] = filter;
  const bucketing = parseFieldBucketing(field);

  if (operator === "time-interval") {
    const [n, unit] = values;
    return [Lib.describeTemporalInterval(n, unit)];
  } else if (isStartingFrom(filter)) {
    const [interval, unit] = getRelativeDatetimeInterval(filter);
    const prefix = Lib.describeTemporalInterval(interval, unit);
    const startingFrom = getStartingFrom(filter);
    if (!startingFrom) {
      return [prefix];
    }
    const [n, bucketing] = startingFrom;
    const suffix = formatStartingFrom(bucketing, -n);
    return [t`${prefix}, starting ${Math.abs(n)} ${suffix}`];
  } else {
    return values.map(value =>
      generateTimeValueDescription(value, bucketing, operator === "!="),
    );
  }
}

function generateTimeValueDescription(value, bucketing, isExclude) {
  if (typeof value === "number" && bucketing === "hour-of-day") {
    return moment().hour(value).format("h A");
  } else if (typeof value === "string") {
    const m = parseTimestamp(value, bucketing);
    if (bucketing) {
      return formatDateTimeWithUnit(value, bucketing, { isExclude });
    } else if (m.hours() || m.minutes()) {
      return m.format("MMMM D, YYYY hh:mm a");
    } else {
      return m.format("MMMM D, YYYY");
    }
  } else if (isRelativeDatetime(value)) {
    let [n, unit] = value;

    if (n === "current") {
      n = 0;
      unit = bucketing;
    }

    return bucketing === unit
      ? Lib.describeTemporalInterval(n, unit)
      : Lib.describeRelativeDatetime(n, unit);
  } else {
    console.warn("Unknown datetime format", value);
    return `[${t`Unknown`}]`;
  }
}

export function absolute(date) {
  if (typeof date === "string") {
    return moment(date);
  } else if (Array.isArray(date) && date[0] === "relative-datetime") {
    return moment().add(date[1], date[2]);
  } else {
    console.warn("Unknown datetime format", date);
  }
}

/**
 * Return the temporal bucketing unit for a `:field` MBQL clause
 */
export function parseFieldBucketing(field, defaultUnit = null) {
  const dimension = FieldDimension.parseMBQLOrWarn(field);
  const isStartingFromExpr = field?.[0] === "+" && field?.[1]?.[0] === "field";
  if (dimension) {
    return dimension.temporalUnit() || defaultUnit;
  } else if (isStartingFromExpr) {
    return parseFieldBucketing(field[1], defaultUnit);
  }
  return defaultUnit;
}

// 271821 BC and 275760 AD and should be far enough in the past/future
function max() {
  return moment(new Date(864000000000000));
}

function min() {
  return moment(new Date(-864000000000000));
}

export function isRelativeDatetime(value) {
  return Array.isArray(value) && value[0] === "relative-datetime";
}

function isInterval(mbql) {
  if (!Array.isArray(mbql)) {
    return false;
  }
  const [op, num, unit] = mbql;
  return (
    op === "interval" &&
    typeof num === "number" &&
    DATETIME_UNITS.indexOf(unit) > -1
  );
}

export function isStartingFrom(mbql) {
  if (!Array.isArray(mbql)) {
    return false;
  }

  const [op, expr, left, right] = mbql;
  if (
    isRelativeDatetime(left) &&
    Array.isArray(expr) &&
    ((op === "between" && isRelativeDatetime(right)) || op === "=")
  ) {
    const [innerOp, _field, interval] = expr;
    if (innerOp === "+" && isInterval(interval)) {
      return true;
    }
  }

  return false;
}

export function getStartingFrom(mbql) {
  if (!isStartingFrom(mbql)) {
    return null;
  }

  const [_op, expr, _left, _right] = mbql;
  const [_expr, _field, interval] = expr;
  const [_interval, num, unit] = interval;
  return [num, unit];
}

export function formatStartingFrom(bucketing, n) {
  const suffix = n >= 0 ? "from now" : "ago";
  switch (bucketing) {
    case "minute":
      return ngettext(msgid`minute ${suffix}`, `minutes ${suffix}`, n);
    case "hour":
      return ngettext(msgid`hour ${suffix}`, `hours ${suffix}`, n);
    case "day":
      return ngettext(msgid`day ${suffix}`, `days ${suffix}`, n);
    case "week":
      return ngettext(msgid`week ${suffix}`, `weeks ${suffix}`, n);
    case "month":
      return ngettext(msgid`month ${suffix}`, `months ${suffix}`, n);
    case "quarter":
      return ngettext(msgid`quarter ${suffix}`, `quarters ${suffix}`, n);
    case "year":
      return ngettext(msgid`year ${suffix}`, `years ${suffix}`, n);
  }
  return "";
}

function getTimeInterval(mbql) {
  if (Array.isArray(mbql) && mbql[0] === "time-interval") {
    return [mbql[1], mbql[2], mbql[3] || "day"];
  }
  return null;
}

export function setStartingFrom(mbql, num, unit) {
  unit = unit && unit !== "none" ? unit : null;
  if (isStartingFrom(mbql)) {
    const [op, expr, left, right] = mbql;
    const [exprOp, field, interval] = expr;
    const [intervalOp, _num, originalUnit] = interval;
    const newUnit = unit || originalUnit;
    const newExpr = [
      exprOp,
      field,
      [intervalOp, num ?? getDefaultDatetimeValue(newUnit), newUnit],
    ];
    return op === "=" ? [op, newExpr, left] : [op, newExpr, left, right];
  }

  const interval = getTimeInterval(mbql);
  if (interval) {
    const [field, intervalNum, intervalUnit] = interval;
    const newUnit = unit || intervalUnit;
    let newValue = num;
    if (typeof newValue !== "number") {
      newValue = (intervalNum < 0 ? 1 : -1) * getDefaultDatetimeValue(newUnit);
    }
    const expr = ["+", field, ["interval", newValue, newUnit]];
    const newInterval = ["relative-datetime", intervalNum, intervalUnit];
    const zeroed = ["relative-datetime", 0, intervalUnit];
    const left = intervalNum < 0 ? newInterval : zeroed;
    const right = intervalNum < 0 ? zeroed : newInterval;
    return ["between", expr, left, right];
  }

  return mbql;
}

function getDefaultDatetimeValue(unit, isDefault = false) {
  switch (unit) {
    case "minute":
      return 60;
    case "hour":
      return 24;
    case "day":
      return isDefault ? 30 : 7;
    case "week":
      return 4;
    case "month":
      return 3;
    case "quarter":
      return 4;
    case "year":
      return 1;
  }
}

export function getRelativeDatetimeField(filter) {
  if (isStartingFrom(filter)) {
    const [_op, expr] = filter;
    const [_exprOp, field] = expr;
    return field;
  } else {
    return filter?.[1];
  }
}

export function getRelativeDatetimeInterval(filter) {
  if (isStartingFrom(filter)) {
    const [_op, _field, [_left, leftNum, unit], right] = filter;
    if (right) {
      const [_right, rightNum] = right;
      return [
        leftNum < 0 ? leftNum : rightNum,
        unit && unit !== "none" ? unit : "day",
      ];
    } else {
      return [leftNum, unit];
    }
  } else if (filter[0] === "time-interval") {
    const unit = filter[3];
    return [filter[2], unit && unit !== "none" ? unit : "day"];
  }

  return [null, null];
}

export function toTimeInterval(filter) {
  const field = getRelativeDatetimeField(filter);

  const [num, unit] = getRelativeDatetimeInterval(filter);
  if (isStartingFrom(filter)) {
    return ["time-interval", field, -num, unit];
  }
  return ["time-interval", field, num, unit];
}

export function updateRelativeDatetimeFilter(filter, positive) {
  if (!filter) {
    return null;
  }

  if (filter[0] === "time-interval") {
    const [op, field, value, unit = "day", options] = filter;
    const numValue =
      typeof value === "number" ? value : getDefaultDatetimeValue(unit, true);
    const newValue = positive ? Math.abs(numValue) : -Math.abs(numValue);
    return options
      ? [op, field, newValue, unit, options]
      : [op, field, newValue, unit];
  } else if (isStartingFrom(filter)) {
    const [_op, [fieldOp, field, [intervalOp, intervalNum, intervalUnit]]] =
      filter;
    const [value, unit] = getRelativeDatetimeInterval(filter);
    const absValue = Math.abs(value);
    const newValue = positive ? absValue : -absValue;
    const absInterval = Math.abs(intervalNum);
    const newInterval = positive ? -absInterval : absInterval;
    const newField = [fieldOp, field, [intervalOp, newInterval, intervalUnit]];
    const zeroed = ["relative-datetime", 0, unit];
    const interval = ["relative-datetime", newValue, unit];
    const left = newValue < 0 ? interval : zeroed;
    const right = newValue < 0 ? zeroed : interval;
    return ["between", newField, left, right];
  }
  return null;
}

export function setRelativeDatetimeUnit(filter, unit) {
  if (filter[0] === "time-interval") {
    return assoc(filter, 3, unit);
  }
  const startingFrom = getStartingFrom(filter);
  if (startingFrom) {
    const [op, field, start, end] = filter;
    return setStartingFrom(
      [op, field, assoc(start, 2, unit), end ? assoc(end, 2, unit) : end],
      startingFrom[0],
      unit,
    );
  }
  return filter;
}

export function setRelativeDatetimeValue(filter, value) {
  if (filter[0] === "time-interval") {
    return assoc(filter, 2, value);
  }
  if (isStartingFrom(filter)) {
    const [_op, field] = filter;
    const [_num, unit] = getRelativeDatetimeInterval(filter);
    return [
      "between",
      field,
      ["relative-datetime", value < 0 ? value : 0, unit],
      ["relative-datetime", value < 0 ? 0 : value, unit],
    ];
  }
  return filter;
}

export const DATE_FORMAT = "YYYY-MM-DD";
export const DATE_TIME_FORMAT = "YYYY-MM-DDTHH:mm:ss";

export const getTimeComponent = value => {
  let hours = null;
  let minutes = null;
  let date = null;
  if (moment(value, DATE_TIME_FORMAT, true).isValid()) {
    date = moment(value, DATE_TIME_FORMAT, true);
    hours = date.hours();
    minutes = date.minutes();
    date.startOf("day");
  } else if (moment(value, DATE_FORMAT, true).isValid()) {
    date = moment(value, DATE_FORMAT, true);
  } else {
    date = moment();
  }
  return { hours, minutes, date };
};

export const setTimeComponent = (value, hours, minutes) => {
  const m = moment(value);
  if (!m.isValid()) {
    return null;
  }

  let hasTime = false;
  if (typeof hours === "number" && typeof minutes === "number") {
    m.hours(hours);
    m.minutes(minutes);
    hasTime = true;
  }

  if (hasTime) {
    return m.format(DATE_TIME_FORMAT);
  } else {
    return m.format(DATE_FORMAT);
  }
};

const getMomentDateForSerialization = date => {
  return date.clone().locale("en");
};

export const TIME_SELECTOR_DEFAULT_HOUR = 12;
export const TIME_SELECTOR_DEFAULT_MINUTE = 30;

export const EXCLUDE_UNITS = {
  days: "day-of-week",
  months: "month-of-year",
  quarters: "quarter-of-year",
  hours: "hour-of-day",
};

export const EXCLUDE_OPTIONS = {
  [EXCLUDE_UNITS["days"]]: () => {
    const now = moment().utc().hours(0).minutes(0).seconds(0).milliseconds(0);
    return [
      _.range(0, 7).map(day => {
        const date = now.day(day + 1);
        const displayName = date.format("dddd");
        const value = date.format("YYYY-MM-DD");
        return {
          displayName,
          value,
          serialized: getMomentDateForSerialization(date).format("ddd"),
          test: val => value === val,
        };
      }),
    ];
  },
  [EXCLUDE_UNITS["months"]]: () => {
    const now = moment()
      .utc()
      .date(1)
      .hours(0)
      .minutes(0)
      .seconds(0)
      .milliseconds(0);
    const func = month => {
      const date = now.month(month);
      const displayName = date.format("MMMM");
      const value = date.format("YYYY-MM-DD");
      return {
        displayName,
        value,
        serialized: getMomentDateForSerialization(date).format("MMM"),
        test: value => moment(value).format("MMMM") === displayName,
      };
    };
    return [_.range(0, 6).map(func), _.range(6, 12).map(func)];
  },
  [EXCLUDE_UNITS["quarters"]]: () => {
    const now = moment().utc().hours(0).minutes(0).seconds(0).milliseconds(0);
    const suffix = " " + t`quarter`;
    return [
      _.range(1, 5).map(quarter => {
        const date = now.quarter(quarter);
        const displayName = date.format("Qo");
        const value = date.format("YYYY-MM-DD");
        return {
          displayName: displayName + suffix,
          value,
          serialized: getMomentDateForSerialization(date).format("Q"),
          test: value => moment(value).format("Qo") === displayName,
        };
      }),
    ];
  },
  [EXCLUDE_UNITS["hours"]]: () => {
    const now = moment().utc().minutes(0).seconds(0).milliseconds(0);
    const func = hour => {
      const date = now.hour(hour);
      const displayName = date.format("h A");
      return {
        displayName,
        value: hour,
        serialized: hour.toString(),
        test: value => value === hour,
      };
    };
    return [_.range(0, 12).map(func), _.range(12, 24).map(func)];
  },
};
