import { t } from "ttag";

import * as Lib from "metabase-lib";

import { OPERATORS } from "./constants";
import type { DefaultFilterOperatorOption } from "./types";

function getOperatorName(operator: Lib.DefaultFilterOperator) {
  switch (operator) {
    case "is-null":
      return t`Is empty`;
    case "not-null":
      return t`Not empty`;
  }
}

export function getAvailableOptions(): DefaultFilterOperatorOption[] {
  return Object.values(OPERATORS).map(({ operator }) => ({
    operator,
    displayName: getOperatorName(operator),
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
