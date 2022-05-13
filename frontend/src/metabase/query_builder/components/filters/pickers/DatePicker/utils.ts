import moment from "moment";
import _ from "underscore";

import { FieldDimension } from "metabase-lib/lib/Dimension";
import Filter from "metabase-lib/lib/queries/structured/Filter";
import {
  getRelativeDatetimeField,
  getTimeComponent,
  setTimeComponent,
} from "metabase/lib/query_time";

export const getIntervals = ([op, _field, value, _unit]: Filter) =>
  op === "time-interval" && typeof value === "number" ? Math.abs(value) : 30;
export const getUnit = ([op, _field, _value, unit]: Filter) => {
  const result = op === "time-interval" && unit ? unit : "day";
  return result;
};
export const getOptions = ([op, _field, _value, _unit, options]: Filter) =>
  (op === "time-interval" && options) || {};

export const getDate = (value: string): string => {
  if (typeof value !== "string" || !moment(value).isValid()) {
    value = moment().format("YYYY-MM-DD");
  }
  // Relative date shortcut sets unit to "none" to avoid preselecting
  if (value === "none") {
    return "day";
  }
  return value;
};

export const hasTime = (value: unknown) =>
  typeof value === "string" && /T\d{2}:\d{2}:\d{2}$/.test(value);

/**
 * Returns MBQL :field clause with temporal bucketing applied.
 * @deprecated -- just use FieldDimension to do this stuff.
 */
export function getDateTimeField(filter: any, bucketing?: string | null) {
  let dimension = filter?.dimension?.();
  if (!dimension) {
    dimension = FieldDimension.parseMBQLOrWarn(
      getRelativeDatetimeField(filter),
    );
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

export function getDateTimeFieldTarget(field: any[]) {
  const dimension = FieldDimension.parseMBQLOrWarn(field);
  if (dimension && dimension.temporalUnit()) {
    return dimension.withoutTemporalBucketing().mbql() as any;
  } else {
    return field;
  }
}

// add temporal-unit to fields if any of them have a time component
export function getDateTimeFieldAndValues(filter: Filter, count: number) {
  let values = filter.slice(2, 2 + count).map(value => value && getDate(value));
  const bucketing = _.any(values, hasTime) ? "minute" : null;
  const field = getDateTimeField(filter, bucketing);
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
  return [field, ...values.filter(value => value !== undefined)];
}

export const getTemporalUnit = (field: Filter) =>
  (Array.isArray(field) && field[2]?.["temporal-unit"]) || null;
