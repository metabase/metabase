/* @flow weak */

import moment from "moment";

import { rangeForValue, fieldRefForColumn } from "metabase/lib/dataset";
import { isDate, isNumber } from "metabase/lib/schema_metadata";

import type { Breakout } from "metabase-types/types/Query";
import type { DimensionValue } from "metabase-types/types/Visualization";
import { parseTimestamp } from "metabase/lib/time";

import Question from "metabase-lib/lib/Question";
import StructuredQuery from "metabase-lib/lib/queries/StructuredQuery";

export { drillDownForDimensions } from "./drilldown";

// QUESTION DRILL ACTIONS

export function aggregate(question: Question, aggregation): ?Question {
  const query = question.query();
  if (query instanceof StructuredQuery) {
    return query
      .aggregate(aggregation)
      .question()
      .setDefaultDisplay();
  }
}

export function breakout(question: Question, breakout): ?Question {
  const query = question.query();
  if (query instanceof StructuredQuery) {
    return query
      .breakout(breakout)
      .question()
      .setDefaultDisplay();
  }
}

// Adds a new filter with the specified operator, column, and value
export function filter(question: Question, operator, column, value): ?Question {
  const query = question.query();
  if (query instanceof StructuredQuery) {
    return query
      .filter([operator, fieldRefForColumn(column), value])
      .question();
  }
}

export function pivot(
  question: Question,
  breakouts: Breakout[] = [],
  dimensions: DimensionValue[] = [],
): ?Question {
  let query = question.query();
  if (query instanceof StructuredQuery) {
    for (const dimension of dimensions) {
      query = drillFilter(query, dimension.value, dimension.column);
      const dimensionRef = fieldRefForColumn(dimension.column);
      for (let i = 0; i < query.breakouts().length; i++) {
        const breakout = query.breakouts()[i];
        if (breakout.dimension().isSameBaseDimension(dimensionRef)) {
          query = breakout.remove();
          i--;
        }
      }
    }
    for (const breakout of breakouts) {
      query = query.breakout(breakout);
    }
    return query.question().setDefaultDisplay();
  }
}

export function distribution(question: Question, column): ?Question {
  const query = question.query();
  if (query instanceof StructuredQuery) {
    const breakout = isDate(column)
      ? ["datetime-field", fieldRefForColumn(column), "month"]
      : isNumber(column)
      ? ["binning-strategy", fieldRefForColumn(column), "default"]
      : fieldRefForColumn(column);
    return query
      .clearAggregations()
      .clearBreakouts()
      .clearSort()
      .clearLimit()
      .aggregate(["count"])
      .breakout(breakout)
      .question()
      .setDisplay("bar");
  }
}

export function toUnderlyingRecords(question: Question): ?Question {
  const query = question.query();
  if (query instanceof StructuredQuery) {
    return query
      .clearAggregations()
      .clearBreakouts()
      .clearSort()
      .clearLimit()
      .clearFields()
      .question()
      .setDisplay("table");
  }
}

export function drillUnderlyingRecords(
  question: Question,
  dimensions,
): ?Question {
  let query = question.query();
  if (query instanceof StructuredQuery) {
    for (const dimension of dimensions) {
      query = drillFilter(query, dimension.value, dimension.column);
    }
    return toUnderlyingRecords(query.question());
  }
}

// STRUCTURED QUERY UTILITIES

export function drillFilter(
  query: StructuredQuery,
  value,
  column,
): StructuredQuery {
  let filter;
  if (isDate(column)) {
    filter = [
      "=",
      ["datetime-field", fieldRefForColumn(column), column.unit],
      parseTimestamp(value, column.unit).format(),
    ];
  } else {
    const range = rangeForValue(value, column);
    if (range) {
      filter = ["between", fieldRefForColumn(column), range[0], range[1]];
    } else {
      filter = ["=", fieldRefForColumn(column), value];
    }
  }

  return addOrUpdateFilter(query, filter);
}

export function addOrUpdateFilter(
  query: StructuredQuery,
  newFilter,
): StructuredQuery {
  // replace existing filter, if it exists
  for (const filter of query.filters()) {
    const dimension = filter.dimension();
    if (dimension && dimension.isSameBaseDimension(newFilter[1])) {
      return filter.replace(newFilter);
    }
  }
  // otherwise add a new filter
  return query.filter(newFilter);
}

// min number of points when switching units
const MIN_INTERVALS = 4;

const UNITS = ["minute", "hour", "day", "week", "month", "quarter", "year"];
const getNextUnit = unit => {
  return UNITS[Math.max(0, UNITS.indexOf(unit) - 1)];
};

export function addOrUpdateBreakout(
  query: StructuredQuery,
  newBreakout,
): StructuredQuery {
  // replace existing breakout, if it exists
  for (const breakout of query.breakouts()) {
    if (breakout.dimension().isSameBaseDimension(newBreakout)) {
      return breakout.replace(newBreakout);
    }
  }
  // otherwise add a new breakout
  return query.breakout(newBreakout);
}

export function updateDateTimeFilter(
  query: StructuredQuery,
  column,
  start,
  end,
): StructuredQuery {
  const fieldRef = fieldRefForColumn(column);
  start = moment(start);
  end = moment(end);
  if (column.unit) {
    // start with the existing breakout unit
    let unit = column.unit;

    // clamp range to unit to ensure we select exactly what's represented by the dots/bars
    start = start.add(1, unit).startOf(unit);
    end = end.endOf(unit);

    // find the largest unit with at least MIN_INTERVALS
    while (
      unit !== getNextUnit(unit) &&
      end.diff(start, unit) < MIN_INTERVALS
    ) {
      unit = getNextUnit(unit);
    }

    // update the breakout
    query = addOrUpdateBreakout(query, ["datetime-field", fieldRef, unit]);

    // round to start of the original unit
    start = start.startOf(column.unit);
    end = end.startOf(column.unit);

    if (start.isAfter(end)) {
      return query;
    }
    if (start.isSame(end, column.unit)) {
      // is the start and end are the same (in whatever the original unit was) then just do an "="
      return addOrUpdateFilter(query, [
        "=",
        ["datetime-field", fieldRef, column.unit],
        start.format(),
      ]);
    } else {
      // otherwise do a between
      return addOrUpdateFilter(query, [
        "between",
        ["datetime-field", fieldRef, column.unit],
        start.format(),
        end.format(),
      ]);
    }
  } else {
    return addOrUpdateFilter(query, [
      "between",
      fieldRef,
      start.format(),
      end.format(),
    ]);
  }
}

export function updateLatLonFilter(
  query: StructuredQuery,
  latitudeColumn,
  longitudeColumn,
  bounds,
): StructuredQuery {
  return addOrUpdateFilter(query, [
    "inside",
    fieldRefForColumn(latitudeColumn),
    fieldRefForColumn(longitudeColumn),
    bounds.getNorth(),
    bounds.getWest(),
    bounds.getSouth(),
    bounds.getEast(),
  ]);
}

export function updateNumericFilter(
  query: StructuredQuery,
  column,
  start,
  end,
): StructuredQuery {
  const fieldRef = fieldRefForColumn(column);
  return addOrUpdateFilter(query, ["between", fieldRef, start, end]);
}
