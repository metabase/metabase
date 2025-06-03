import { t } from "ttag";

import type * as Lib from "metabase-lib";

import { getClauseDefinition, isDefinedClause } from "./clause";
import { DiagnosticError } from "./errors";

export function expressionModeSupportsClause(
  expressionMode: Lib.ExpressionMode,
  operator: string,
) {
  try {
    assertModeSupportsClause(expressionMode, operator);
    return true;
  } catch {
    return false;
  }
}

export function assertModeSupportsClause(
  expressionMode: Lib.ExpressionMode,
  operator: string,
) {
  if (!isDefinedClause(operator)) {
    throw new DiagnosticError(t`Unknown operator ${operator}`);
  }

  const clause = getClauseDefinition(operator);
  if (clause.type === "aggregation" && expressionMode !== "aggregation") {
    throw new DiagnosticError(
      t`Aggregations like ${clause.displayName} are not allowed when building a custom ${expressionMode}`,
    );
  }
}
