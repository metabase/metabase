import * as Lib from "metabase-lib";
import { OPERATOR_OPTIONS } from "./constants";

export function hasValidValues(
  operator: Lib.BooleanFilterOperatorName,
  values: boolean[],
) {
  const { valueCount } = OPERATOR_OPTIONS[operator];
  return values.length === valueCount;
}

export function getFilterClause(
  operator: Lib.BooleanFilterOperatorName,
  column: Lib.ColumnMetadata,
  values: boolean[],
) {
  if (!hasValidValues(operator, values)) {
    return null;
  }

  return Lib.booleanFilterClause({
    operator,
    column,
    values,
  });
}
