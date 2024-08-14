import {
  getAvailableOperatorOptions,
  getDefaultAvailableOperator,
} from "metabase/querying/utils/filters";
import * as Lib from "metabase-lib";

import { OPERATOR_OPTIONS } from "./constants";
import type { OperatorOption } from "./types";

function isNotEmpty(value: string) {
  return value.length > 0;
}

export function getAvailableOptions(
  query: Lib.Query,
  stageIndex: number,
  column: Lib.ColumnMetadata,
) {
  return getAvailableOperatorOptions(
    query,
    stageIndex,
    column,
    OPERATOR_OPTIONS,
  );
}

export function getOptionByOperator(operator: Lib.StringFilterOperatorName) {
  return OPERATOR_OPTIONS[operator];
}

export function getDefaultOperator(
  column: Lib.ColumnMetadata,
  availableOptions: OperatorOption[],
): Lib.StringFilterOperatorName {
  const desiredOperator =
    Lib.isPrimaryKey(column) ||
    Lib.isForeignKey(column) ||
    Lib.isCategory(column)
      ? "="
      : "contains";
  return getDefaultAvailableOperator(availableOptions, desiredOperator);
}

export function getDefaultValues(
  operator: Lib.StringFilterOperatorName,
  values: string[],
): string[] {
  const { type } = OPERATOR_OPTIONS[operator];
  return type !== "empty" ? values.filter(isNotEmpty) : [];
}

export function isValidFilter(
  operator: Lib.StringFilterOperatorName,
  column: Lib.ColumnMetadata,
  values: string[] = [],
  options: Lib.StringFilterOptions,
) {
  return getFilterParts(operator, column, values, options) != null;
}

export function getFilterClause(
  operator: Lib.StringFilterOperatorName,
  column: Lib.ColumnMetadata,
  values: string[],
  options: Lib.StringFilterOptions,
) {
  const filterParts = getFilterParts(operator, column, values, options);
  return filterParts != null ? Lib.stringFilterClause(filterParts) : undefined;
}

function getFilterParts(
  operator: Lib.StringFilterOperatorName,
  column: Lib.ColumnMetadata,
  values: string[],
  options: Lib.StringFilterOptions,
): Lib.StringFilterParts | undefined {
  const { type } = OPERATOR_OPTIONS[operator];
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
