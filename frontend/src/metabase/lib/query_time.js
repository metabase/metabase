import moment from "moment";
import { assoc } from "icepick";
import inflection from "inflection";
import { t, ngettext, msgid } from "ttag";

import { formatDateTimeWithUnit } from "metabase/lib/formatting";
import { parseTimestamp } from "metabase/lib/time";

import { FieldDimension } from "metabase-lib/lib/Dimension";
import { isValidField } from "metabase/lib/query/field_ref";

export const DATETIME_UNITS = [
  // "default",
  "minute",
  "hour",
  "day",
  "week",
  "month",
  "quarter",
  "year",
  // "minute-of-hour",
  "hour-of-day",
  "day-of-week",
  "day-of-month",
  // "day-of-year",
  "week-of-year",
  "month-of-year",
  "quarter-of-year",
];

export function computeFilterTimeRange(filter) {
  let expandedFilter;
  if (filter[0] === "time-interval") {
    expandedFilter = expandTimeIntervalFilter(filter);
  } else {
    expandedFilter = filter;
  }

  const [operator, field, ...values] = expandedFilter;
  const bucketing = parseFieldBucketing(field, "day");

  let start, end;
  if (operator === "=" && values[0]) {
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
  if (isStartingFrom(filter)) {
    const [value, unit] = getStartingFrom(filter);
    start = start.add(-value, unit);
    end = end.add(-value, unit);
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
      ["relative-datetime", n - 1, unit],
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
    return generateTimeIntervalDescription(n, unit);
  } else {
    return values.map(value => generateTimeValueDescription(value, bucketing));
  }
}

export function generateTimeIntervalDescription(n, unit) {
  if (unit === "day") {
    switch (n) {
      case "current":
      case 0:
        return [t`Today`];
      case "next":
      case 1:
        return [t`Tomorrow`];
      case "last":
      case -1:
        return [t`Yesterday`];
    }
  }

  if (!unit && n === 0) {
    return t`Today`;
  } // ['relative-datetime', 'current'] is a legal MBQL form but has no unit

  switch (n) {
    case "current":
    case 0:
      return [t`This ${formatBucketing(unit)}`];
    case "next":
    case 1:
      return [t`Next ${formatBucketing(unit)}`];
    case "last":
    case -1:
      return [t`Previous ${formatBucketing(unit)}`];
  }

  if (n < 0) {
    return [t`Previous ${-n} ${formatBucketing(unit, -n)}`];
  } else if (n > 0) {
    return [t`Next ${n} ${formatBucketing(unit, n)}`];
  } else {
    return [t`This ${formatBucketing(unit)}`];
  }
}

export function generateTimeValueDescription(value, bucketing) {
  if (typeof value === "string") {
    const m = parseTimestamp(value, bucketing);
    if (bucketing) {
      return formatDateTimeWithUnit(value, bucketing);
    } else if (m.hours() || m.minutes()) {
      return m.format("MMMM D, YYYY hh:mm a");
    } else {
      return m.format("MMMM D, YYYY");
    }
  } else if (isRelativeDatetime(value)) {
    let n = value[1];
    let unit = value[2];

    if (n === "current") {
      n = 0;
      unit = bucketing;
    }

    if (bucketing === unit) {
      return generateTimeIntervalDescription(n, unit);
    } else {
      // FIXME: what to do if the bucketing and unit don't match?
      if (n === 0) {
        return t`Now`;
      } else {
        return n < 0
          ? t`${-n} ${formatBucketing(unit, -n).toLowerCase()} ago`
          : t`${n} ${formatBucketing(unit, n).toLowerCase()} from now`;
      }
    }
  } else {
    console.warn("Unknown datetime format", value);
    return `[${t`Unknown`}]`;
  }
}

export function formatBucketing(bucketing = "", n = 1) {
  if (!bucketing) {
    return "";
  }
  switch (bucketing) {
    case "default":
      return ngettext(msgid`Default period`, `Default periods`, n);
    case "minute":
      return ngettext(msgid`Minute`, `Minutes`, n);
    case "hour":
      return ngettext(msgid`Hour`, `Hours`, n);
    case "day":
      return ngettext(msgid`Day`, `Days`, n);
    case "week":
      return ngettext(msgid`Week`, `Weeks`, n);
    case "month":
      return ngettext(msgid`Month`, `Months`, n);
    case "quarter":
      return ngettext(msgid`Quarter`, `Quarters`, n);
    case "year":
      return ngettext(msgid`Year`, `Years`, n);
    case "minute-of-hour":
      return ngettext(msgid`Minute of hour`, `Minutes of hour`, n);
    case "hour-of-day":
      return ngettext(msgid`Hour of day`, `Hours of day`, n);
    case "day-of-week":
      return ngettext(msgid`Day of week`, `Days of week`, n);
    case "day-of-month":
      return ngettext(msgid`Day of month`, `Days of month`, n);
    case "day-of-year":
      return ngettext(msgid`Day of year`, `Days of year`, n);
    case "week-of-year":
      return ngettext(msgid`Week of year`, `Weeks of year`, n);
    case "month-of-year":
      return ngettext(msgid`Month of year`, `Months of year`, n);
    case "quarter-of-year":
      return ngettext(msgid`Quarter of year`, `Quarters of year`, n);
  }
  const words = bucketing.split("-");
  words[0] = inflection.capitalize(words[0]);
  return words.join(" ");
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
  if (dimension) {
    return dimension.temporalUnit() || defaultUnit;
  }
  return defaultUnit;
}

// returns field with temporal bucketing removed
export function parseFieldTarget(field) {
  const dimension = FieldDimension.parseMBQLOrWarn(field);
  if (dimension) {
    return dimension.withoutTemporalBucketing();
  }
  return field;
}

/**
 * Get the raw integer ID from a `field` clause, otherwise return the clause as-is. (TODO: Why would we want to
 * return the clause as-is?)
 */
export function parseFieldTargetId(field) {
  const dimension = FieldDimension.parseMBQLOrWarn(field);
  if (dimension) {
    if (dimension.isIntegerFieldId()) {
      return dimension.fieldIdOrName();
    }
  }
  return field;
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

export function isInterval(mbql) {
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
    const [innerOp, innerField, interval] = expr;
    if (innerOp === "+" && isValidField(innerField) && isInterval(interval)) {
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

export function getTimeInterval(mbql) {
  if (
    Array.isArray(mbql) &&
    mbql[0] === "time-interval" &&
    isValidField(mbql[1])
  ) {
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
      [intervalOp, num ?? getDefaultStartingFrom(newUnit), newUnit],
    ];
    return [op, newExpr, left, right];
  }

  const interval = getTimeInterval(mbql);
  if (interval) {
    const [field, intervalNum, intervalUnit] = interval;
    const newUnit = unit || intervalUnit;
    const expr = [
      "+",
      field,
      ["interval", num ?? getDefaultStartingFrom(newUnit), newUnit],
    ];
    const newInterval = ["relative-datetime", intervalNum, intervalUnit];
    if (intervalNum === -1 || intervalNum === 1) {
      return ["=", expr, newInterval];
    } else {
      const zeroed = ["relative-datetime", 0, intervalUnit];
      const left = intervalNum < 0 ? newInterval : zeroed;
      const right = intervalNum < 0 ? zeroed : newInterval;
      return ["between", expr, left, right];
    }
  }

  return mbql;
}

function getDefaultStartingFrom(unit) {
  switch (unit) {
    case "minute":
      return 60;
    case "hour":
      return 24;
    case "day":
      return 7;
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
    const [op, field, value, unit, options] = filter;
    if (typeof value !== "number") {
      return null;
    }
    const newValue = positive ? Math.abs(value) : -Math.abs(value);
    return [op, field, newValue, unit, options];
  } else if (isStartingFrom(filter)) {
    const [
      _op,
      [fieldOp, field, [intervalOp, intervalNum, intervalUnit]],
    ] = filter;
    const [value, unit] = getRelativeDatetimeInterval(filter);
    const absValue = Math.abs(value);
    const newValue = positive ? absValue : -absValue;
    const newField = [fieldOp, field, [intervalOp, -intervalNum, intervalUnit]];
    if (absValue === 1) {
      return ["=", newField, ["relative-datetime", newValue, unit]];
    }
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
  if (isStartingFrom(filter)) {
    const [op, field, start, end] = filter;
    return [op, field, assoc(start, 2, unit), end ? assoc(end, 2, unit) : end];
  }
  return filter;
}

export function setRelativeDatetimeValue(filter, value) {
  if (filter[0] === "time-interval") {
    return assoc(filter, 2, value);
  }
  if (isStartingFrom(filter)) {
    const [_op, field, start, end] = filter;
    if (value === 1 || value === -1) {
      return ["=", field, assoc(start, 1, value)];
    }
    return [
      "between",
      field,
      assoc(start, 1, value < 0 ? value : 0),
      assoc(end, 1, value < 0 ? 0 : value),
    ];
  }
  return filter;
}
