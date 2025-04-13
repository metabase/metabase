import * as Lib from "metabase-lib";
import type { Expression } from "metabase-types/api";

import { DiagnosticError } from "../errors";
import type { StartRule } from "../types";
import { getExpressionMode } from "../utils";

export function checkLibDiagnostics({
  query,
  stageIndex,
  startRule,
  expression,
  expressionIndex,
}: {
  query: Lib.Query;
  stageIndex: number;
  startRule: StartRule;
  expression: Expression;
  expressionIndex?: number;
}) {
  const error = Lib.diagnoseExpression(
    query,
    stageIndex,
    getExpressionMode(startRule),
    expression,
    expressionIndex,
  );
  if (error) {
    throw new DiagnosticError(error.message, {
      friendly: Boolean(error.friendly),
    });
  }
}
