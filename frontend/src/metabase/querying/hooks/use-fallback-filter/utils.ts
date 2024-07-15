import { getAvailableOperatorOptions } from "metabase/querying/utils/filters";
import * as Lib from "metabase-lib";

import { OPERATOR_OPTIONS } from "./constants";

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

export function getFilterClause(
  operator: Lib.FallbackFilterOperatorName | undefined,
  column: Lib.ColumnMetadata,
) {
  if (operator) {
    return Lib.fallbackFilterClause({ operator, column });
  }
}
