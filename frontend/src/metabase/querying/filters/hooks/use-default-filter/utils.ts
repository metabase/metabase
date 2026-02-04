import * as Lib from "metabase-lib";

import { OPERATORS } from "./constants";
import type { DefaultFilterOperatorOption } from "./types";

export function getAvailableOptions(): DefaultFilterOperatorOption[] {
  return Object.values(OPERATORS).map(({ operator }) => ({
    operator,
    displayName: Lib.describeFilterOperator(operator),
  }));
}

export function getDefaultOperator(
  hasInitialOperator: boolean,
): Lib.DefaultFilterOperator | undefined {
  return hasInitialOperator ? "is-null" : undefined;
}

export function getFilterClause(
  operator: Lib.DefaultFilterOperator | undefined,
  column: Lib.ColumnMetadata,
) {
  if (operator) {
    return Lib.defaultFilterClause({ operator, column });
  }
}
