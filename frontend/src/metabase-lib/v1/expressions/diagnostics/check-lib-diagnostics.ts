import * as Lib from "metabase-lib";

import { DiagnosticError } from "../errors";
import type { StartRule } from "../types";
import { getExpressionMode } from "../utils";

export function checkLibDiagnostics({
  query,
  stageIndex,
  startRule,
  expressionClause,
  expressionIndex,
}: {
  query: Lib.Query;
  stageIndex: number;
  startRule: StartRule;
  expressionClause: Lib.ExpressionClause;
  expressionIndex?: number;
}) {
  const error = Lib.diagnoseExpression(
    query,
    stageIndex,
    getExpressionMode(startRule),
    expressionClause,
    expressionIndex,
  );
  if (error) {
    throw new DiagnosticError(error.message, {
      friendly: Boolean(error.friendly),
    });
  }
}
