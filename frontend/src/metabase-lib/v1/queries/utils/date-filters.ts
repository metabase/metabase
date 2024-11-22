import moment from "moment-timezone"; // eslint-disable-line no-restricted-imports -- deprecated usage
import _ from "underscore";

import Dimension, { FieldDimension } from "metabase-lib/v1/Dimension";
import type Field from "metabase-lib/v1/metadata/Field";
import type { FilterMBQL } from "metabase-lib/v1/queries/structured/Filter";
import {
  getRelativeDatetimeField,
  getRelativeDatetimeInterval,
  getTimeComponent,
  isRelativeDatetime,
  setTimeComponent,
  updateRelativeDatetimeFilter,
} from "metabase-lib/v1/queries/utils/query-time";

const testTemporalUnit = (unit: string) => (filter: FilterMBQL) => {
  const dimension = FieldDimension.parseMBQLOrWarn(filter[1]);
  if (dimension) {
    return dimension.temporalUnit() === unit;
  }
  return filter[1]?.[2]?.["temporal-unit"] === unit;
};

function getIntervals([op, _field, value, _unit]: FilterMBQL) {
  return op === "time-interval" && typeof value === "number"
    ? Math.abs(value)
    : 30;
}

function getUnit([op, _field, _value, unit]: FilterMBQL) {
  const result = op === "time-interval" && unit ? unit : "day";
  return result;
}

function getOptions([op, _field, _value, _unit, options]: FilterMBQL) {
  return (op === "time-interval" && options) || {};
}

function getDate(value: string): string {
  if (typeof value !== "string" || !moment(value).isValid()) {
    value = moment().format("YYYY-MM-DD");
  }
  // Relative date shortcut sets unit to "none" to avoid preselecting
  if (value === "none") {
    return "day";
  }
  return value;
}

function hasTime(value: unknown) {
  return typeof value === "string" && /T\d{2}:\d{2}:\d{2}$/.test(value);
}

/**
 * Returns MBQL :field clause with temporal bucketing applied.
 * @deprecated -- just use FieldDimension to do this stuff.
 */
function getDateTimeDimensionFromFilter(
  filter: any,
  bucketing?: string | null,
) {
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

// note: this is probably buggy because we aren't passing `metadata` and `query`
function getDateTimeDimensionFromMbql(mbql: any, bucketing?: string) {
  const dimension = Dimension.parseMBQL(mbql);
  if (dimension) {
    if (bucketing) {
      return dimension.withTemporalUnit(bucketing).mbql();
    } else {
      return dimension.withoutTemporalBucketing().mbql();
    }
  }
  return mbql;
}

function getDateTimeFieldRef(field: Field, bucketing?: string) {
  const dimension =
    FieldDimension.parseMBQLOrWarn(field) ?? new FieldDimension(null);
  if (bucketing) {
    return dimension.withTemporalUnit(bucketing).mbql();
  } else {
    return dimension.withoutTemporalBucketing().mbql();
  }
}

// add temporal-unit to fields if any of them have a time component
function getDateTimeDimensionFromFilterAndValues(filter: FilterMBQL) {
  let values = filter.slice(2).map(value => value && getDate(value));
  const bucketing = _.any(values, hasTime) ? "minute" : null;
  const dimension = getDateTimeDimensionFromFilter(filter, bucketing);
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

function getOnFilterDimensionAndValues(filter: FilterMBQL) {
  const [op] = filter;
  const [dimension, ...values] =
    getDateTimeDimensionFromFilterAndValues(filter);

  if (op === "between") {
    return [dimension, values[1]];
  } else {
    return [dimension, values[0]];
  }
}

function getBeforeFilterDimensionAndValues(filter: FilterMBQL) {
  const [op] = filter;
  const [dimension, ...values] =
    getDateTimeDimensionFromFilterAndValues(filter);

  if (op === "between") {
    return [dimension, values[1]];
  } else {
    return [dimension, values[0]];
  }
}

function getAfterFilterDimensionAndValues(filter: FilterMBQL) {
  const [field, ...values] = getDateTimeDimensionFromFilterAndValues(filter);
  return [field, values[0]];
}

function getBetweenFilterDimensionAndValues(filter: FilterMBQL) {
  const [op] = filter;
  const [dimension, ...values] =
    getDateTimeDimensionFromFilterAndValues(filter);

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

export function getPreviousDateFilter(filter: FilterMBQL) {
  return (
    updateRelativeDatetimeFilter(filter, false) || [
      "time-interval",
      getDateTimeDimensionFromFilter(filter),
      -getIntervals(filter),
      getUnit(filter),
      getOptions(filter),
    ]
  );
}

export function isPreviousDateFilter(filter: FilterMBQL) {
  const [op, _field, left] = filter;
  if (op === "time-interval" && typeof left === "number" && left <= 0) {
    return true;
  }
  const [value] = getRelativeDatetimeInterval(filter);
  return typeof value === "number" && value <= 0;
}

export function getCurrentDateFilter(filter: FilterMBQL) {
  return ["time-interval", getDateTimeDimensionFromFilter(filter), "current"];
}

export function isCurrentDateFilter(filter: FilterMBQL) {
  const [op, , value] = filter;
  return op === "time-interval" && (value === "current" || value === null);
}

export function getNextDateFilter(filter: FilterMBQL) {
  return (
    updateRelativeDatetimeFilter(filter, true) || [
      "time-interval",
      getDateTimeDimensionFromFilter(filter),
      getIntervals(filter),
      getUnit(filter),
      getOptions(filter),
    ]
  );
}

export function isNextDateFilter(filter: FilterMBQL) {
  const [op, _field, left] = filter;
  if (op === "time-interval" && left > 0) {
    return true;
  }
  const [value] = getRelativeDatetimeInterval(filter);
  return typeof value === "number" && value > 0;
}

export function getBetweenDateFilter(filter: FilterMBQL) {
  return ["between", ...getBetweenFilterDimensionAndValues(filter)];
}

export function isBetweenFilter(filter: FilterMBQL) {
  const [op, , left, right] = filter;
  return (
    op === "between" && !isRelativeDatetime(left) && !isRelativeDatetime(right)
  );
}

export function getBeforeDateFilter(filter: FilterMBQL) {
  return ["<", ...getBeforeFilterDimensionAndValues(filter)];
}

export function isBeforeDateFilter(filter: FilterMBQL) {
  const [op] = filter;
  return op === "<";
}

export function getOnDateFilter(filter: FilterMBQL) {
  return ["=", ...getOnFilterDimensionAndValues(filter)];
}

export function isOnDateFilter(filter: FilterMBQL) {
  const [op] = filter;
  return op === "=";
}

export function getAfterDateFilter(filter: FilterMBQL) {
  return [">", ...getAfterFilterDimensionAndValues(filter)];
}

export function isAfterDateFilter(filter: FilterMBQL) {
  const [op] = filter;
  return op === ">";
}

export function getExcludeDateFilter(filter: FilterMBQL) {
  const [op, field, ...values] = filter;
  return op === "!=" ? [op, field, ...values] : [op, field];
}

export function isExcludeDateFilter(filter: FilterMBQL) {
  const [op] = filter;
  return ["!=", "is-null", "not-null"].indexOf(op) > -1;
}

export function getTodayDateFilter(filter: FilterMBQL) {
  return [
    "time-interval",
    getDateTimeDimensionFromMbql(filter[1]),
    "current",
    "day",
    { include_current: true },
  ];
}

export function getYesterdayDateFilter(filter: FilterMBQL) {
  return [
    "time-interval",
    getDateTimeDimensionFromMbql(filter[1]),
    -1,
    "day",
    { include_current: false },
  ];
}

export function getLastWeekDateFilter(filter: FilterMBQL) {
  return [
    "time-interval",
    getDateTimeDimensionFromMbql(filter[1]),
    -1,
    "week",
    { include_current: false },
  ];
}

export function getLast7DaysDateFilter(filter: FilterMBQL) {
  return [
    "time-interval",
    getDateTimeDimensionFromMbql(filter[1]),
    -7,
    "day",
    { include_current: false },
  ];
}

export function getLast30DaysDateFilter(filter: FilterMBQL) {
  return [
    "time-interval",
    getDateTimeDimensionFromMbql(filter[1]),
    -30,
    "day",
    { include_current: false },
  ];
}

export function getLastMonthDateFilter(filter: FilterMBQL) {
  return [
    "time-interval",
    getDateTimeDimensionFromMbql(filter[1]),
    -1,
    "month",
    { include_current: false },
  ];
}

export function getLast3MonthsDateFilter(filter: FilterMBQL) {
  return [
    "time-interval",
    getDateTimeDimensionFromMbql(filter[1]),
    -3,
    "month",
    { include_current: false },
  ];
}

export function getLast12MonthsDateFilter(filter: FilterMBQL) {
  return [
    "time-interval",
    getDateTimeDimensionFromMbql(filter[1]),
    -12,
    "month",
    { include_current: false },
  ];
}

export function getNotNullDateFilter(filter: FilterMBQL) {
  return ["not-null", getDateTimeFieldRef(filter[1])];
}

export function getIsNullDateFilter(filter: FilterMBQL) {
  return ["is-null", getDateTimeFieldRef(filter[1])];
}

export function getInitialSpecificDatesShortcut(filter: FilterMBQL) {
  return [
    "between",
    getDateTimeDimensionFromMbql(filter[1]),
    moment().subtract(30, "day").format("YYYY-MM-DD"),
    moment().format("YYYY-MM-DD"),
  ];
}

export function getInitialRelativeDatesShortcut(filter: FilterMBQL) {
  return ["time-interval", getDateTimeDimensionFromMbql(filter[1]), -30, "day"];
}

export function getInitialExcludeShortcut(filter: FilterMBQL) {
  return ["!=", getDateTimeDimensionFromMbql(filter[1])];
}

export function getInitialDayOfWeekFilter(filter: FilterMBQL) {
  return ["!=", getDateTimeFieldRef(filter[1], "day-of-week")];
}

export function getInitialMonthOfYearFilter(filter: FilterMBQL) {
  return ["!=", getDateTimeFieldRef(filter[1], "month-of-year")];
}

export function getInitialQuarterOfYearFilter(filter: FilterMBQL) {
  return ["!=", getDateTimeFieldRef(filter[1], "quarter-of-year")];
}

export function getInitialHourOfDayFilter(filter: FilterMBQL) {
  return ["!=", getDateTimeFieldRef(filter[1], "hour-of-day")];
}

export const isDayOfWeekDateFilter = testTemporalUnit("day-of-week");
export const isMonthOfYearDateFilter = testTemporalUnit("month-of-year");
export const isQuarterofYearDateFilter = testTemporalUnit("quarter-of-year");
export const isHourOfDayDateFilter = testTemporalUnit("hour-of-day");

export function getDateFilterValue(mbql: any[]) {
  const [_op, _field, value] = mbql;
  return value;
}

export function setDateFilterValue(mbql: any[], newValue: string | null) {
  const [op, field] = mbql;
  return [op, field, newValue];
}

export function clearDateFilterTime(mbql: any[]) {
  return setDateFilterValue(mbql, setTimeComponent(getDateFilterValue(mbql)));
}

export function getDateRangeFilterValue(mbql: any[]) {
  const [_op, _field, startValue, endValue] = mbql;
  return [startValue, endValue];
}

export function setDateRangeFilterValue(
  mbql: any[],
  [startValue, endValue]: [string | null, string | null],
) {
  const [op, field] = mbql;
  return [op, field, startValue, endValue];
}

export function clearDateRangeFilterTime(mbql: any[]) {
  const [startValue, endValue] = getDateRangeFilterValue(mbql);

  return setDateRangeFilterValue(mbql, [
    setTimeComponent(startValue),
    setTimeComponent(endValue),
  ]);
}
