import {
  getAvailableOperatorOptions,
  getDefaultAvailableOperator,
} from "metabase/querying/filters/utils/operators";
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

export function getOptionByOperator(operator: Lib.StringFilterOperator) {
  return OPERATOR_OPTIONS[operator];
}

export function getDefaultOperator(
  query: Lib.Query,
  column: Lib.ColumnMetadata,
  availableOptions: OperatorOption[],
): Lib.StringFilterOperator {
  const fieldValuesInfo = Lib.fieldValuesSearchInfo(query, column);

  const desiredOperator =
    Lib.isPrimaryKey(column) ||
    Lib.isForeignKey(column) ||
    fieldValuesInfo.hasFieldValues !== "none"
      ? "="
      : "contains";
  return getDefaultAvailableOperator(availableOptions, desiredOperator);
}

export function getDefaultValues(
  operator: Lib.StringFilterOperator,
  values: string[],
): string[] {
  const { type } = OPERATOR_OPTIONS[operator];
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
