import { useMemo, useState } from "react";

import { isNotNull } from "metabase/lib/types";
import * as Lib from "metabase-lib";
import * as LibMetric from "metabase-lib/metric";

import type { FilterOperatorOption } from "../types";

type CoordinatePickerOperator =
  | "="
  | "!="
  | ">"
  | "<"
  | "between"
  | "inside"
  | ">="
  | "<=";

type CoordinateFilterOperatorOption =
  FilterOperatorOption<CoordinatePickerOperator>;

type CoordinateFilterOperatorInfo = {
  operator: CoordinatePickerOperator;
  valueCount: number;
  hasMultipleValues?: boolean;
};

export type NumberOrEmptyValue = LibMetric.NumberFilterValue | null;

const OPERATORS: Record<
  Lib.CoordinateFilterOperator,
  CoordinateFilterOperatorInfo
> = {
  "=": {
    operator: "=",
    valueCount: 1,
    hasMultipleValues: true,
  },
  "!=": {
    operator: "!=",
    valueCount: 1,
    hasMultipleValues: true,
  },
  inside: {
    operator: "inside",
    valueCount: 4,
  },
  ">": {
    operator: ">",
    valueCount: 1,
  },
  "<": {
    operator: "<",
    valueCount: 1,
  },
  between: {
    operator: "between",
    valueCount: 2,
  },
  ">=": {
    operator: ">=",
    valueCount: 1,
  },
  "<=": {
    operator: "<=",
    valueCount: 1,
  },
};

function getAvailableOptions(): CoordinateFilterOperatorOption[] {
  return Object.values(OPERATORS).map(({ operator }) => ({
    operator,
    displayName: Lib.describeFilterOperator(operator),
  }));
}

function getOptionByOperator(operator: Lib.CoordinateFilterOperator) {
  return OPERATORS[operator];
}

function getDefaultOperator(): Lib.CoordinateFilterOperator {
  return "between";
}

function getAvailableDimensions(
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

function getDefaultSecondDimension(
  dimensions: LibMetric.DimensionMetadata[],
  filterParts: LibMetric.CoordinateFilterParts | null,
): LibMetric.DimensionMetadata | undefined {
  return filterParts?.longitudeDimension ?? dimensions[0];
}

function canPickDimensions(
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

function isValidFilter(
  operator: Lib.CoordinateFilterOperator,
  dimension: LibMetric.DimensionMetadata,
  secondDimension: LibMetric.DimensionMetadata | undefined,
  values: NumberOrEmptyValue[],
) {
  return getFilterParts(operator, dimension, secondDimension, values) != null;
}

function getFilterClause(
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

interface UseCoordinateFilterProps {
  definition: LibMetric.MetricDefinition;
  dimension: LibMetric.DimensionMetadata;
  filter?: LibMetric.FilterClause;
}

export function useCoordinateFilter({
  definition,
  dimension,
  filter,
}: UseCoordinateFilterProps) {
  const filterParts = useMemo(
    () => (filter ? LibMetric.coordinateFilterParts(definition, filter) : null),
    [definition, filter],
  );

  const availableOptions = useMemo(() => getAvailableOptions(), []);

  const availableDimensions = useMemo(
    () => getAvailableDimensions(definition, dimension),
    [definition, dimension],
  );

  const [operator, setOperator] = useState(
    filterParts ? filterParts.operator : getDefaultOperator(),
  );
  const [values, setValues] = useState(
    getDefaultValues(operator, filterParts ? filterParts.values : []),
  );
  const [secondDimension, setSecondDimension] = useState(
    getDefaultSecondDimension(availableDimensions, filterParts),
  );

  const { valueCount, hasMultipleValues } = getOptionByOperator(operator);
  const isValid = isValidFilter(operator, dimension, secondDimension, values);

  return {
    operator,
    availableOptions,
    values,
    valueCount,
    hasMultipleValues,
    availableDimensions,
    secondDimension,
    canPickDimensions: canPickDimensions(operator, availableDimensions),
    isValid,
    getDefaultValues,
    getFilterClause: (
      operator: Lib.CoordinateFilterOperator,
      secondDimension: LibMetric.DimensionMetadata | undefined,
      values: NumberOrEmptyValue[],
    ) => getFilterClause(operator, dimension, secondDimension, values),
    setOperator,
    setValues,
    setSecondDimension,
  };
}
