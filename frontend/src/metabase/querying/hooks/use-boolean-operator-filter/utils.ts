import * as Lib from "metabase-lib";
import { OPERATOR_OPTIONS } from "./constants";

export function isValidFilter(
  operator: Lib.BooleanFilterOperatorName,
  column: Lib.ColumnMetadata,
  values: boolean[],
) {
  return getFilterParts(operator, column, values) != null;
}

export function getFilterClause(
  operator: Lib.BooleanFilterOperatorName,
  column: Lib.ColumnMetadata,
  values: boolean[],
) {
  const filterParts = getFilterParts(operator, column, values);
  return filterParts != null ? Lib.booleanFilterClause(filterParts) : undefined;
}

function getFilterParts(
  operator: Lib.BooleanFilterOperatorName,
  column: Lib.ColumnMetadata,
  values: boolean[],
): Lib.BooleanFilterParts | undefined {
  const { valueCount } = OPERATOR_OPTIONS[operator];
  if (values.length !== valueCount) {
    return undefined;
  }

  return {
    operator,
    column,
    values,
  };
}
