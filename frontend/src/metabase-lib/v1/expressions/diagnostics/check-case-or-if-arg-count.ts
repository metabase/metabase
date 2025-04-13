import { t } from "ttag";

import type { Expression } from "metabase-types/api";

import { DiagnosticError } from "../errors";
import { isCallExpression, isCaseOrIfOperator } from "../matchers";
import { getToken } from "../utils";
import { visit } from "../visitor";

export function checkCaseOrIfArgCount({
  expression,
}: {
  expression: Expression;
}) {
  visit(expression, (node) => {
    if (!isCallExpression(node)) {
      return;
    }
    const [op] = node;
    if (!isCaseOrIfOperator(op)) {
      return;
    }

    const pairs = node[1] as [Expression, Expression][];

    if (pairs.length < 1) {
      throw new DiagnosticError(
        t`${op.toUpperCase()} expects 2 arguments or more`,
        getToken(node),
      );
    }
  });
}
