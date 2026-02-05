import dayjs from "dayjs";

import { isNotNull } from "metabase/lib/types";
import * as LibMetric from "metabase-lib/metric";

import { OPERATORS } from "./constants";
import type { TimeFilterOperatorOption, TimeValue } from "./types";

export function getAvailableOptions(): TimeFilterOperatorOption[] {
  return Object.values(OPERATORS).map(({ operator }) => ({
    operator,
    displayName: getOperatorDisplayName(operator),
  }));
}

export function getOptionByOperator(operator: LibMetric.TimeFilterOperator) {
  return OPERATORS[operator];
}

export function getDefaultOperator(): LibMetric.TimeFilterOperator {
  return "<";
}

function getDefaultValue() {
  return dayjs().startOf("day").toDate(); // 00:00:00
}

export function getDefaultValues(
  operator: LibMetric.TimeFilterOperator,
  values: TimeValue[],
): TimeValue[] {
  const { valueCount } = OPERATORS[operator];

  return Array(valueCount)
    .fill(getDefaultValue())
    .map((value, index) => values[index] ?? value);
}

export function isValidFilter(
  operator: LibMetric.TimeFilterOperator,
  dimension: LibMetric.DimensionMetadata,
  values: TimeValue[],
) {
  return getFilterParts(operator, dimension, values) != null;
}

export function getFilterClause(
  operator: LibMetric.TimeFilterOperator,
  dimension: LibMetric.DimensionMetadata,
  values: TimeValue[],
) {
  const filterParts = getFilterParts(operator, dimension, values);
  if (filterParts == null) {
    return undefined;
  }

  return LibMetric.timeFilterClause(filterParts);
}

function getFilterParts(
  operator: LibMetric.TimeFilterOperator,
  dimension: LibMetric.DimensionMetadata,
  values: TimeValue[],
): LibMetric.TimeFilterParts | undefined {
  if (!values.every(isNotNull)) {
    return undefined;
  }

  if (operator === "between") {
    const [startTime, endTime] = values;
    return {
      operator,
      dimension,
      values: dayjs(endTime).isBefore(startTime)
        ? [endTime, startTime]
        : [startTime, endTime],
    };
  }

  return {
    operator,
    dimension,
    values,
  };
}

function getOperatorDisplayName(
  operator: LibMetric.TimeFilterOperator,
): string {
  switch (operator) {
    case "<":
      return "Before";
    case ">":
      return "After";
    case "between":
      return "Between";
    case "is-null":
      return "Is empty";
    case "not-null":
      return "Not empty";
  }
}
