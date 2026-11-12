import { t } from "ttag";

import * as Lib from "metabase-lib";

import { getClauseDefinition, isDefinedClause } from "./clause";
import { DiagnosticError } from "./errors";

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
      t`${clause.displayName}() combines many rows into one value, so it only works in Summarize. Use it there, or choose a function that works on one row at a time.`,
    );
  }

  return null;
}

export function columnsForExpressionMode({
  query,
  stageIndex = -1,
  expressionIndex,
  expressionMode,
}: {
  query: Lib.Query;
  stageIndex?: number;
  expressionIndex?: number;
  expressionMode: Lib.ExpressionMode;
}) {
  if (expressionMode === "aggregation") {
    return Lib.aggregableColumns(query, stageIndex, expressionIndex);
  }
  return Lib.expressionableColumns(query, stageIndex, expressionIndex);
}
