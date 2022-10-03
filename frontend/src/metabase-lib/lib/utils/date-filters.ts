import moment from "moment-timezone";

import {
  updateRelativeDatetimeFilter,
  isRelativeDatetime,
  getRelativeDatetimeInterval,
  getRelativeDatetimeField,
  getTimeComponent,
  setTimeComponent,
} from "metabase/lib/query_time";
import Dimension from "metabase-lib/lib/Dimension";

import type Filter from "metabase-lib/lib/queries/structured/Filter";

const getIntervals = ([op, _field, value, _unit]: Filter) =>
  op === "time-interval" && typeof value === "number" ? Math.abs(value) : 30;
const getUnit = ([op, _field, _value, unit]: Filter) => {
  const result = op === "time-interval" && unit ? unit : "day";
  return result;
};
const getOptions = ([op, _field, _value, _unit, options]: Filter) =>
  (op === "time-interval" && options) || {};

const getDate = (value: string): string => {
  if (typeof value !== "string" || !moment(value).isValid()) {
    value = moment().format("YYYY-MM-DD");
  }
  // Relative date shortcut sets unit to "none" to avoid preselecting
  if (value === "none") {
    return "day";
  }
  return value;
};

const hasTime = (value: unknown) =>
  typeof value === "string" && /T\d{2}:\d{2}:\d{2}$/.test(value);

/**
 * Returns MBQL :field clause with temporal bucketing applied.
 * @deprecated -- just use FieldDimension to do this stuff.
 */
function getDateTimeDimension(filter: any, bucketing?: string | null) {
  let dimension = filter?.dimension?.();
  if (!dimension) {
    dimension = Dimension.parseMBQL(getRelativeDatetimeField(filter));
  }
  if (dimension) {
    if (bucketing) {
      return dimension.withTemporalUnit(bucketing).mbql();
    } else {
      return dimension.withoutTemporalBucketing().mbql();
    }
  }
  return null;
}

// add temporal-unit to fields if any of them have a time component
function getDateTimeDimensionAndValues(filter: Filter) {
  let values = filter.slice(2).map(value => value && getDate(value));
  const bucketing = _.any(values, hasTime) ? "minute" : null;
  const dimension = getDateTimeDimension(filter, bucketing);
  const { hours, minutes } = getTimeComponent(values[0]);
  if (
    typeof hours === "number" &&
    typeof minutes === "number" &&
    values.length === 2
  ) {
    const { hours: otherHours, minutes: otherMinutes } = getTimeComponent(
      values[1],
    );
    if (typeof otherHours !== "number" || typeof otherMinutes !== "number") {
      values = [
        values[0],
        setTimeComponent(values[1], hours, minutes) || values[0],
      ];
    }
  }
  return [dimension, ...values.filter(value => value !== undefined)];
}

function getOnFilterDimensionAndValues(filter: Filter) {
  const [op] = filter;
  const [dimension, ...values] = getDateTimeDimensionAndValues(filter);

  if (op === "between") {
    return [dimension, values[1]];
  } else {
    return [dimension, values[0]];
  }
}

function getBeforeFilterDimensionAndValues(filter: Filter) {
  const [op] = filter;
  const [dimension, ...values] = getDateTimeDimensionAndValues(filter);

  if (op === "between") {
    return [dimension, values[1]];
  } else {
    return [dimension, values[0]];
  }
}

function getAfterFilterDimensionAndValues(filter: Filter) {
  const [field, ...values] = getDateTimeDimensionAndValues(filter);
  return [field, values[0]];
}

function getBetweenFilterDimensionAndValues(filter: Filter) {
  const [op] = filter;
  const [dimension, ...values] = getDateTimeDimensionAndValues(filter);

  if (op === "=" || op === "<") {
    const beforeDate = moment(values[0]).subtract(30, "day");
    const beforeValue = beforeDate.format("YYYY-MM-DD");
    return [dimension, beforeValue, values[0]];
  } else if (op === ">") {
    const afterDate = moment(values[0]).add(30, "day");
    const afterValue = afterDate.format("YYYY-MM-DD");
    return [dimension, values[0], afterValue];
  } else {
    return [dimension, ...values];
  }
}

export function getPreviousDateFilter(filter: Filter) {
  return (
    updateRelativeDatetimeFilter(filter, false) || [
      "time-interval",
      getDateTimeDimension(filter),
      -getIntervals(filter),
      getUnit(filter),
      getOptions(filter),
    ]
  );
}

export function isPreviousDateFilter(filter: Filter) {
  const [op, _field, left] = filter;
  if (op === "time-interval" && typeof left === "number" && left <= 0) {
    return true;
  }
  const [value] = getRelativeDatetimeInterval(filter);
  return typeof value === "number" && value <= 0;
}

export function getCurrentDateFilter(filter: Filter) {
  return ["time-interval", getDateTimeDimension(filter), "current"];
}

export function isCurrentDateFilter(filter: Filter) {
  const [op, , value] = filter;
  return op === "time-interval" && (value === "current" || value === null);
}

export function getNextDateFilter(filter: Filter) {
  return (
    updateRelativeDatetimeFilter(filter, true) || [
      "time-interval",
      getDateTimeDimension(filter),
      getIntervals(filter),
      getUnit(filter),
      getOptions(filter),
    ]
  );
}

export function isNextDateFilter(filter: Filter) {
  const [op, _field, left] = filter;
  if (op === "time-interval" && left > 0) {
    return true;
  }
  const [value] = getRelativeDatetimeInterval(filter);
  return typeof value === "number" && value > 0;
}

export function getBetweenDateFilter(filter: Filter) {
  return ["between", ...getBetweenFilterDimensionAndValues(filter)];
}

export function isBetweenFilter(filter: Filter) {
  const [op, , left, right] = filter;
  return (
    op === "between" && !isRelativeDatetime(left) && !isRelativeDatetime(right)
  );
}

export function getBeforeDateFilter(filter: Filter) {
  return ["<", ...getBeforeFilterDimensionAndValues(filter)];
}

export function isBeforeDateFilter(filter: Filter) {
  const [op] = filter;
  return op === "<";
}

export function getOnDateFilter(filter: Filter) {
  return ["=", ...getOnFilterDimensionAndValues(filter)];
}

export function isOnDateFilter(filter: Filter) {
  const [op] = filter;
  return op === "=";
}

export function getAfterDateFilter(filter: Filter) {
  return [">", ...getAfterFilterDimensionAndValues(filter)];
}

export function isAfterDateFilter(filter: Filter) {
  const [op] = filter;
  return op === ">";
}

export function getExcludeDateFilter(filter: Filter) {
  const [op, field, ...values] = filter;
  return op === "!=" ? [op, field, ...values] : [op, field];
}

export function isExcludeDateFilter(filter: Filter) {
  const [op] = filter;
  return ["!=", "is-null", "not-null"].indexOf(op) > -1;
}
