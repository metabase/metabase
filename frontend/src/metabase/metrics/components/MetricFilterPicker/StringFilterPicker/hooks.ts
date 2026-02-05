import { useMemo, useState } from "react";

import * as Lib from "metabase-lib";
import * as LibMetric from "metabase-lib/metric";

import type { FilterOperatorOption } from "../types";

export type OperatorType = "exact" | "partial" | "empty";

type StringFilterOperatorOption =
  FilterOperatorOption<Lib.StringFilterOperator>;

type StringFilterOperatorInfo = {
  operator: Lib.StringFilterOperator;
  type: OperatorType;
};

const OPERATORS: Record<Lib.StringFilterOperator, StringFilterOperatorInfo> = {
  "=": {
    operator: "=",
    type: "exact",
  },
  "!=": {
    operator: "!=",
    type: "exact",
  },
  contains: {
    operator: "contains",
    type: "partial",
  },
  "does-not-contain": {
    operator: "does-not-contain",
    type: "partial",
  },
  "starts-with": {
    operator: "starts-with",
    type: "partial",
  },
  "ends-with": {
    operator: "ends-with",
    type: "partial",
  },
  "is-empty": {
    operator: "is-empty",
    type: "empty",
  },
  "not-empty": {
    operator: "not-empty",
    type: "empty",
  },
};

function isNotEmpty(value: string) {
  return value.length > 0;
}

function getAvailableOptions(
  dimension: LibMetric.DimensionMetadata,
): StringFilterOperatorOption[] {
  const isStringLike = LibMetric.isStringLike(dimension);

  return Object.values(OPERATORS)
    .filter(({ type }) => !isStringLike || type !== "partial")
    .map(({ operator }) => ({
      operator,
      displayName: Lib.describeFilterOperator(operator),
    }));
}

function getOptionByOperator(operator: Lib.StringFilterOperator) {
  return OPERATORS[operator];
}

function getDefaultOperator(
  definition: LibMetric.MetricDefinition,
  dimension: LibMetric.DimensionMetadata,
): Lib.StringFilterOperator {
  const dimensionInfo = LibMetric.dimensionValuesInfo(definition, dimension);

  if (
    LibMetric.isPrimaryKey(dimension) ||
    LibMetric.isForeignKey(dimension) ||
    LibMetric.isStringLike(dimension) ||
    dimensionInfo.canListValues ||
    dimensionInfo.canSearchValues
  ) {
    return "=";
  }

  return "contains";
}

export function getDefaultValues(
  operator: Lib.StringFilterOperator,
  values: string[],
): string[] {
  const { type } = OPERATORS[operator];
  return type !== "empty" ? values.filter(isNotEmpty) : [];
}

function isValidFilter(
  operator: Lib.StringFilterOperator,
  dimension: LibMetric.DimensionMetadata,
  values: string[] = [],
  options: LibMetric.StringFilterOptions,
) {
  return getFilterParts(operator, dimension, values, options) != null;
}

function getFilterClause(
  operator: Lib.StringFilterOperator,
  dimension: LibMetric.DimensionMetadata,
  values: string[],
  options: LibMetric.StringFilterOptions,
) {
  const filterParts = getFilterParts(operator, dimension, values, options);
  return filterParts != null
    ? LibMetric.stringFilterClause(filterParts)
    : undefined;
}

function getFilterParts(
  operator: Lib.StringFilterOperator,
  dimension: LibMetric.DimensionMetadata,
  values: string[],
  options: LibMetric.StringFilterOptions,
): LibMetric.StringFilterParts | undefined {
  const { type } = OPERATORS[operator];
  if (values.length === 0 && type !== "empty") {
    return undefined;
  }

  return {
    operator,
    dimension,
    values,
    options,
  };
}

interface UseStringFilterProps {
  definition: LibMetric.MetricDefinition;
  dimension: LibMetric.DimensionMetadata;
  filter?: LibMetric.FilterClause;
}

export function useStringFilter({
  definition,
  dimension,
  filter,
}: UseStringFilterProps) {
  const filterParts = useMemo(
    () => (filter ? LibMetric.stringFilterParts(definition, filter) : null),
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

  const [options, setOptions] = useState(
    filterParts ? filterParts.options : { caseSensitive: false },
  );

  const { type } = getOptionByOperator(operator);
  const isValid = isValidFilter(operator, dimension, values, options);

  return {
    type,
    operator,
    availableOptions,
    values,
    options,
    isValid,
    getDefaultValues,
    getFilterClause: (
      operator: Lib.StringFilterOperator,
      values: string[],
      options: LibMetric.StringFilterOptions,
    ) => getFilterClause(operator, dimension, values, options),
    setOperator,
    setValues,
    setOptions,
  };
}
