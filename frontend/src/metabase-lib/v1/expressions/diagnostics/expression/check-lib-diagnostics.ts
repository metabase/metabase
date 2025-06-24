import * as Lib from "metabase-lib";

import { DiagnosticError } from "../../errors";

export function checkLibDiagnostics({
  query,
  stageIndex,
  expressionMode,
  expressionClause,
  expressionIndex,
}: {
  query: Lib.Query;
  stageIndex: number;
  expressionMode: Lib.ExpressionMode;
  expressionClause: Lib.ExpressionClause;
  expressionIndex?: number;
}) {
  const error = Lib.diagnoseExpression(
    query,
    stageIndex,
    expressionMode,
    expressionClause,
    expressionIndex,
  );
  if (error) {
    throw new DiagnosticError(error.message, {
      friendly: Boolean(error.friendly),
    });
  }
}
