import { t } from "ttag";

import * as Lib from "metabase-lib";

import { OPERATORS } from "./constants";
import type { StringFilterOperatorOption } from "./types";

function isNotEmpty(value: string) {
  return value.length > 0;
}

function getOperatorName(operator: Lib.StringFilterOperator) {
  switch (operator) {
    case "=":
      return t`Is`;
    case "!=":
      return t`Is not`;
    case "contains":
      return t`Contains`;
    case "does-not-contain":
      return t`Does not contain`;
    case "starts-with":
      return t`Starts with`;
    case "ends-with":
      return t`Ends with`;
    case "is-empty":
      return t`Is empty`;
    case "not-empty":
      return t`Not empty`;
  }
}

export function getAvailableOptions(
  column: Lib.ColumnMetadata,
): StringFilterOperatorOption[] {
  const isStringLike = Lib.isStringLike(column);

  return Object.values(OPERATORS)
    .filter(({ type }) => !isStringLike || type !== "partial")
    .map(({ operator }) => ({
      operator,
      displayName: getOperatorName(operator),
    }));
}

export function getOptionByOperator(operator: Lib.StringFilterOperator) {
  return OPERATORS[operator];
}

export function getDefaultOperator(
  query: Lib.Query,
  column: Lib.ColumnMetadata,
): Lib.StringFilterOperator {
  const fieldValuesInfo = Lib.fieldValuesSearchInfo(query, column);

  if (
    Lib.isPrimaryKey(column) ||
    Lib.isForeignKey(column) ||
    Lib.isStringLike(column) ||
    fieldValuesInfo.hasFieldValues !== "none"
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
  column: Lib.ColumnMetadata,
  values: string[] = [],
  options: Lib.StringFilterOptions,
) {
  return getFilterParts(operator, column, values, options) != null;
}

export function getFilterClause(
  operator: Lib.StringFilterOperator,
  column: Lib.ColumnMetadata,
  values: string[],
  options: Lib.StringFilterOptions,
) {
  const filterParts = getFilterParts(operator, column, values, options);
  return filterParts != null ? Lib.stringFilterClause(filterParts) : undefined;
}

function getFilterParts(
  operator: Lib.StringFilterOperator,
  column: Lib.ColumnMetadata,
  values: string[],
  options: Lib.StringFilterOptions,
): Lib.StringFilterParts | undefined {
  const { type } = OPERATORS[operator];
  if (values.length === 0 && type !== "empty") {
    return undefined;
  }

  return {
    operator,
    column,
    values,
    options,
  };
}
