import * as Lib from "metabase-lib";
import { OPERATOR_OPTIONS } from "./constants";

function isNotEmpty(value: string) {
  return value.length > 0;
}

export function getDefaultValues(
  operator: Lib.StringFilterOperatorName,
  values: string[] = [],
): string[] {
  const { valueCount, hasMultipleValues } = OPERATOR_OPTIONS[operator];
  if (hasMultipleValues) {
    return values.filter(isNotEmpty);
  }

  return Array(valueCount)
    .fill("")
    .map((value, index) => values[index] ?? value);
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
  const { valueCount, hasMultipleValues } = OPERATOR_OPTIONS[operator];
  if (!values.every(isNotEmpty)) {
    return undefined;
  }
  if (hasMultipleValues ? values.length === 0 : values.length !== valueCount) {
    return undefined;
  }

  return {
    operator,
    column,
    values,
    options,
  };
}
