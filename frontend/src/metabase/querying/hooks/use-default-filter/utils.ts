import {
  getAvailableOperatorOptions,
  getDefaultAvailableOperator,
} from "metabase/querying/utils/filters";
import * as Lib from "metabase-lib";

import { OPERATOR_OPTIONS } from "./constants";
import type { OperatorOption } from "./types";

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

export function getDefaultOperator(
  availableOptions: OperatorOption[],
  hasInitialOperator: boolean,
): Lib.DefaultFilterOperatorName | undefined {
  return hasInitialOperator
    ? getDefaultAvailableOperator(availableOptions)
    : undefined;
}

export function getFilterClause(
  operator: Lib.DefaultFilterOperatorName | undefined,
  column: Lib.ColumnMetadata,
) {
  if (operator) {
    return Lib.defaultFilterClause({ operator, column });
  }
}
