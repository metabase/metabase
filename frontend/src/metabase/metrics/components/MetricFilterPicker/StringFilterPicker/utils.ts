import * as Lib from "metabase-lib";
import * as LibMetric from "metabase-lib/metric";

import { OPERATORS } from "./constants";
import type { StringFilterOperatorOption } from "./types";

function isNotEmpty(value: string) {
  return value.length > 0;
}

export function getAvailableOptions(
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

export function getOptionByOperator(operator: Lib.StringFilterOperator) {
  return OPERATORS[operator];
}

export function getDefaultOperator(
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

export function isValidFilter(
  operator: Lib.StringFilterOperator,
  dimension: LibMetric.DimensionMetadata,
  values: string[] = [],
  options: LibMetric.StringFilterOptions,
) {
  return getFilterParts(operator, dimension, values, options) != null;
}

export function getFilterClause(
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
