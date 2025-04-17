import * as Lib from "metabase-lib";

import { getClauseDefinition } from "../config";
import { DiagnosticError } from "../errors";
import { getToken } from "../utils";
import { visit } from "../visitor";

export function checkArgValidators({
  expressionParts,
}: {
  expressionParts: Lib.ExpressionParts | Lib.ExpressionArg;
}) {
  visit(expressionParts, (node) => {
    if (!Lib.isExpressionParts(node)) {
      return;
    }
    const { operator, args } = node;
    const clause = getClauseDefinition(operator);
    if (!clause) {
      return;
    }

    if (clause.validator) {
      const validationError = clause.validator(...args);
      if (validationError) {
        throw new DiagnosticError(validationError, getToken(node));
      }
    }
  });
}
