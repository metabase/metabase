import { useMemo, useState } from "react";

import { isNotNull } from "metabase/lib/types";
import * as Lib from "metabase-lib";
import * as LibMetric from "metabase-lib/metric";

import type { FilterOperatorOption } from "../types";

type NumberFilterOperatorOption =
  FilterOperatorOption<Lib.NumberFilterOperator>;

type NumberFilterOperatorInfo = {
  operator: Lib.NumberFilterOperator;
  valueCount: number;
  hasMultipleValues?: boolean;
};

export type NumberOrEmptyValue = LibMetric.NumberFilterValue | null;

const OPERATORS: Record<Lib.NumberFilterOperator, NumberFilterOperatorInfo> = {
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
  "is-null": {
    operator: "is-null",
    valueCount: 0,
  },
  "not-null": {
    operator: "not-null",
    valueCount: 0,
  },
};

function getAvailableOptions(
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

function getOptionByOperator(operator: Lib.NumberFilterOperator) {
  return OPERATORS[operator];
}

function getDefaultOperator(
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

function isValidFilter(
  operator: Lib.NumberFilterOperator,
  dimension: LibMetric.DimensionMetadata,
  values: NumberOrEmptyValue[],
) {
  return getFilterParts(operator, dimension, values) != null;
}

function getFilterClause(
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

interface UseNumberFilterProps {
  definition: LibMetric.MetricDefinition;
  dimension: LibMetric.DimensionMetadata;
  filter?: LibMetric.FilterClause;
}

export function useNumberFilter({
  definition,
  dimension,
  filter,
}: UseNumberFilterProps) {
  const filterParts = useMemo(
    () => (filter ? LibMetric.numberFilterParts(definition, filter) : null),
    [definition, filter],
  );

  const availableOptions = useMemo(
    () => getAvailableOptions(dimension),
    [dimension],
  );

  const [operator, setOperator] = useState(() =>
    filterParts
      ? filterParts.operator
      : getDefaultOperator(definition, dimension),
  );

  const [values, setValues] = useState(() =>
    getDefaultValues(operator, filterParts ? filterParts.values : []),
  );

  const { valueCount, hasMultipleValues } = getOptionByOperator(operator);
  const isValid = isValidFilter(operator, dimension, values);

  return {
    operator,
    availableOptions,
    values,
    valueCount,
    hasMultipleValues,
    isValid,
    getDefaultValues,
    getFilterClause: (
      operator: Lib.NumberFilterOperator,
      values: NumberOrEmptyValue[],
    ) => getFilterClause(operator, dimension, values),
    setOperator,
    setValues,
  };
}
