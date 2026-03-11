import { isNotNull } from "metabase/lib/types";
import * as Lib from "metabase-lib";
import * as LibMetric from "metabase-lib/metric";

import { OPERATORS } from "./constants";
import type {
  CoordinateFilterOperatorOption,
  NumberOrEmptyValue,
} from "./types";

export function getAvailableOptions(): CoordinateFilterOperatorOption[] {
  return Object.values(OPERATORS).map(({ operator }) => ({
    operator,
    displayName: Lib.describeFilterOperator(operator),
  }));
}

export function getOptionByOperator(operator: Lib.CoordinateFilterOperator) {
  return OPERATORS[operator];
}

export function getDefaultOperator(): Lib.CoordinateFilterOperator {
  return "between";
}

export function getAvailableDimensions(
  definition: LibMetric.MetricDefinition,
  dimension: LibMetric.DimensionMetadata,
) {
  const isLatitude = LibMetric.isLatitude(dimension);
  const isLongitude = LibMetric.isLongitude(dimension);
  return LibMetric.filterableDimensions(definition).filter(
    (dim) =>
      (isLatitude && LibMetric.isLongitude(dim)) ||
      (isLongitude && LibMetric.isLatitude(dim)),
  );
}

export function getDefaultSecondDimension(
  dimensions: LibMetric.DimensionMetadata[],
  filterParts: LibMetric.CoordinateFilterParts | null,
): LibMetric.DimensionMetadata | undefined {
  return filterParts?.longitudeDimension ?? dimensions[0];
}

export function canPickDimensions(
  operator: Lib.CoordinateFilterOperator,
  dimensions: LibMetric.DimensionMetadata[],
) {
  return operator === "inside" && dimensions.length > 1;
}

export function getDefaultValues(
  operator: Lib.CoordinateFilterOperator,
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
  operator: Lib.CoordinateFilterOperator,
  dimension: LibMetric.DimensionMetadata,
  secondDimension: LibMetric.DimensionMetadata | undefined,
  values: NumberOrEmptyValue[],
) {
  return getFilterParts(operator, dimension, secondDimension, values) != null;
}

export function getFilterClause(
  operator: Lib.CoordinateFilterOperator,
  dimension: LibMetric.DimensionMetadata,
  secondDimension: LibMetric.DimensionMetadata | undefined,
  values: NumberOrEmptyValue[],
) {
  const filterParts = getFilterParts(
    operator,
    dimension,
    secondDimension,
    values,
  );
  return filterParts != null
    ? LibMetric.coordinateFilterClause(filterParts)
    : undefined;
}

function getFilterParts(
  operator: Lib.CoordinateFilterOperator,
  dimension: LibMetric.DimensionMetadata,
  secondDimension: LibMetric.DimensionMetadata | undefined,
  values: NumberOrEmptyValue[],
): LibMetric.CoordinateFilterParts | undefined {
  switch (operator) {
    case "between":
      return getBetweenFilterParts(operator, dimension, values);
    case "inside":
      return getInsideFilterParts(operator, dimension, secondDimension, values);
    default:
      return getSimpleFilterParts(operator, dimension, values);
  }
}

function getSimpleFilterParts(
  operator: Lib.CoordinateFilterOperator,
  dimension: LibMetric.DimensionMetadata,
  values: NumberOrEmptyValue[],
): LibMetric.CoordinateFilterParts | undefined {
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
    longitudeDimension: null,
    values: values.filter(isNotNull),
  };
}

function getBetweenFilterParts(
  operator: Lib.CoordinateFilterOperator,
  dimension: LibMetric.DimensionMetadata,
  values: NumberOrEmptyValue[],
): LibMetric.CoordinateFilterParts | undefined {
  const [startValue, endValue] = values;
  if (isNotNull(startValue) && isNotNull(endValue)) {
    const minValue = startValue < endValue ? startValue : endValue;
    const maxValue = startValue < endValue ? endValue : startValue;

    return {
      operator,
      dimension,
      longitudeDimension: null,
      values: [minValue, maxValue],
    };
  } else if (isNotNull(startValue)) {
    return {
      operator: ">=",
      dimension,
      longitudeDimension: null,
      values: [startValue],
    };
  } else if (isNotNull(endValue)) {
    return {
      operator: "<=",
      dimension,
      longitudeDimension: null,
      values: [endValue],
    };
  } else {
    return undefined;
  }
}

function getInsideFilterParts(
  operator: Lib.CoordinateFilterOperator,
  dimension: LibMetric.DimensionMetadata,
  secondDimension: LibMetric.DimensionMetadata | undefined,
  values: NumberOrEmptyValue[],
): LibMetric.CoordinateFilterParts | undefined {
  if (!values.every(isNotNull)) {
    return undefined;
  }
  if (secondDimension == null) {
    return undefined;
  }

  const isLatitude = LibMetric.isLatitude(dimension);
  const [upperLatitude, leftLongitude, lowerLatitude, rightLongitude] = values;

  return {
    operator,
    dimension: isLatitude ? dimension : secondDimension,
    longitudeDimension: isLatitude ? secondDimension : dimension,
    values: [
      lowerLatitude < upperLatitude ? upperLatitude : lowerLatitude,
      leftLongitude < rightLongitude ? leftLongitude : rightLongitude,
      lowerLatitude < upperLatitude ? lowerLatitude : upperLatitude,
      leftLongitude < rightLongitude ? rightLongitude : leftLongitude,
    ],
  };
}
