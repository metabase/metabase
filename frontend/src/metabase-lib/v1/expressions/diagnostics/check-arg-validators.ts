import type { Expression } from "metabase-types/api";

import { getClauseDefinition } from "../config";
import { DiagnosticError } from "../errors";
import { isCallExpression, isOptionsObject } from "../matchers";
import { getToken } from "../utils";
import { visit } from "../visitor";

export function checkArgValidators({ expression }: { expression: Expression }) {
  visit(expression, (node) => {
    if (!isCallExpression(node)) {
      return;
    }
    const [name, ...operands] = node;
    const clause = getClauseDefinition(name);
    if (!clause) {
      return;
    }

    if (clause.validator) {
      const args = operands.filter((arg) => !isOptionsObject(arg));
      const validationError = clause.validator(...args);
      if (validationError) {
        throw new DiagnosticError(validationError, getToken(node));
      }
    }
  });
}
