import { t } from "ttag";

import type * as Lib from "metabase-lib";

import { getClauseDefinition, isDefinedClause } from "./clause";
import { DiagnosticError } from "./errors";

const MODE_DISPLAY_NAMES: Record<Lib.ExpressionMode, () => string> = {
  expression: () => t`expression`,
  filter: () => t`filter`,
  aggregation: () => t`aggregation`,
};

export function expressionModeDisplayName(expressionMode: Lib.ExpressionMode) {
  return MODE_DISPLAY_NAMES[expressionMode]();
}

export function expressionModeSupportsClause(
  expressionMode: Lib.ExpressionMode,
  operator: string,
) {
  const error = checkExpressionModeSupportsClause(expressionMode, operator);
  return error === null;
}

export function checkExpressionModeSupportsClause(
  expressionMode: Lib.ExpressionMode,
  operator: string,
) {
  if (!isDefinedClause(operator)) {
    throw new DiagnosticError(t`Unknown operator ${operator}`);
  }

  const clause = getClauseDefinition(operator);
  if (clause.type === "aggregation" && expressionMode !== "aggregation") {
    return new DiagnosticError(
      t`Aggregations like ${clause.displayName} are not allowed when building a custom ${expressionModeDisplayName(expressionMode)}`,
    );
  }

  return null;
}
