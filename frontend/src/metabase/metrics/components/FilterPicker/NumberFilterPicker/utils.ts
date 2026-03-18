import { isNotNull } from "metabase/lib/types";
import * as Lib from "metabase-lib";
import * as LibMetric from "metabase-lib/metric";

import { OPERATORS } from "./constants";
import type { NumberFilterOperatorOption, NumberOrEmptyValue } from "./types";

export function getAvailableOptions(
  dimension: LibMetric.DimensionMetadata,
): NumberFilterOperatorOption[] {
  const isKey =
    LibMetric.isPrimaryKey(dimension) || LibMetric.isForeignKey(dimension);
  const variant = isKey ? "default" : "number";

  return Object.values(OPERATORS).map(({ operator }) => ({
    operator,
    displayName: Lib.describeFilterOperator(operator, variant),
  }));
}

export function getOptionByOperator(operator: Lib.NumberFilterOperator) {
  return OPERATORS[operator];
}

export function getDefaultOperator(
  definition: LibMetric.MetricDefinition,
  dimension: LibMetric.DimensionMetadata,
): Lib.NumberFilterOperator {
  const dimensionInfo = LibMetric.dimensionValuesInfo(definition, dimension);

  return LibMetric.isPrimaryKey(dimension) ||
    LibMetric.isForeignKey(dimension) ||
    dimensionInfo.canListValues ||
    dimensionInfo.canSearchValues
    ? "="
    : "between";
}

export function getDefaultValues(
  operator: Lib.NumberFilterOperator,
  values: NumberOrEmptyValue[],
): NumberOrEmptyValue[] {
  const { valueCount, hasMultipleValues } = OPERATORS[operator];
  if (hasMultipleValues) {
    return values.filter(isNotNull);
  }

  return Array(valueCount)
    .fill(null)
    .map((value, index) => values[index] ?? value);
}

export function isValidFilter(
  operator: Lib.NumberFilterOperator,
  dimension: LibMetric.DimensionMetadata,
  values: NumberOrEmptyValue[],
) {
  return getFilterParts(operator, dimension, values) != null;
}

export function getFilterClause(
  operator: Lib.NumberFilterOperator,
  dimension: LibMetric.DimensionMetadata,
  values: NumberOrEmptyValue[],
) {
  const filterParts = getFilterParts(operator, dimension, values);
  return filterParts != null
    ? LibMetric.numberFilterClause(filterParts)
    : undefined;
}

function getFilterParts(
  operator: Lib.NumberFilterOperator,
  dimension: LibMetric.DimensionMetadata,
  values: NumberOrEmptyValue[],
): LibMetric.NumberFilterParts | undefined {
  switch (operator) {
    case "between":
      return getBetweenFilterParts(operator, dimension, values);
    default:
      return getSimpleFilterParts(operator, dimension, values);
  }
}

function getSimpleFilterParts(
  operator: Lib.NumberFilterOperator,
  dimension: LibMetric.DimensionMetadata,
  values: NumberOrEmptyValue[],
): LibMetric.NumberFilterParts | undefined {
  const { valueCount, hasMultipleValues } = getOptionByOperator(operator);
  if (!values.every(isNotNull)) {
    return undefined;
  }
  if (hasMultipleValues ? values.length === 0 : values.length !== valueCount) {
    return undefined;
  }

  return {
    operator,
    dimension,
    values: values.filter(isNotNull),
  };
}

function getBetweenFilterParts(
  operator: Lib.NumberFilterOperator,
  dimension: LibMetric.DimensionMetadata,
  values: NumberOrEmptyValue[],
): LibMetric.NumberFilterParts | undefined {
  const [startValue, endValue] = values;
  if (isNotNull(startValue) && isNotNull(endValue)) {
    const minValue = startValue < endValue ? startValue : endValue;
    const maxValue = startValue < endValue ? endValue : startValue;

    return {
      operator,
      dimension,
      values: [minValue, maxValue],
    };
  } else if (isNotNull(startValue)) {
    return {
      operator: ">=",
      dimension,
      values: [startValue],
    };
  } else if (isNotNull(endValue)) {
    return {
      operator: "<=",
      dimension,
      values: [endValue],
    };
  }
}
