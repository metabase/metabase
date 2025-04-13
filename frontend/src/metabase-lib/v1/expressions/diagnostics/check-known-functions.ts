import { t } from "ttag";

import type { Expression } from "metabase-types/api";

import { FIELD_MARKERS, getClauseDefinition } from "../config";
import { DiagnosticError } from "../errors";
import { isCallExpression } from "../matchers";
import { getToken } from "../utils";
import { visit } from "../visitor";

export function checkKnownFunctions({
  expression,
}: {
  expression: Expression;
}) {
  visit(expression, (node) => {
    if (!isCallExpression(node)) {
      return;
    }

    const name = node[0];
    if (FIELD_MARKERS.has(name) || name === "value" || name === "expression") {
      return;
    }

    const clause = getClauseDefinition(name);
    if (!clause) {
      throw new DiagnosticError(t`Unknown function ${name}`, getToken(node));
    }
  });
}
