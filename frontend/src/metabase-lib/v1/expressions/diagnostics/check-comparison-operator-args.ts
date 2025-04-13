import { t } from "ttag";

import type { Expression } from "metabase-types/api";

import { COMPARISON_OPERATORS } from "../config";
import { DiagnosticError } from "../errors";
import { isOperator } from "../matchers";
import type { OPERATOR } from "../tokenizer";
import { getToken } from "../utils";
import { visit } from "../visitor";

export function checkComparisonOperatorArgs({
  expression,
}: {
  expression: Expression;
}) {
  visit(expression, (node) => {
    if (!isOperator(node)) {
      return;
    }
    const [name, ...operands] = node;
    if (!COMPARISON_OPERATORS.has(name as OPERATOR)) {
      return;
    }
    const [firstOperand] = operands;
    if (typeof firstOperand === "number") {
      throw new DiagnosticError(
        t`Expecting field but found ${firstOperand}`,
        getToken(node),
      );
    }
  });
}
