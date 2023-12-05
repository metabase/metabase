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

export function hasValidValues(
  operator: Lib.StringFilterOperatorName,
  values: string[] = [],
) {
  const { valueCount, hasMultipleValues } = OPERATOR_OPTIONS[operator];
  if (!values.every(isNotEmpty)) {
    return false;
  }

  return hasMultipleValues ? values.length > 0 : values.length === valueCount;
}

export function getFilterClause(
  operator: Lib.StringFilterOperatorName,
  column: Lib.ColumnMetadata,
  values: string[],
  options: Lib.StringFilterOptions,
) {
  return Lib.stringFilterClause({ operator, column, values, options });
}
