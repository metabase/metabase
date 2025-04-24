import { t } from "ttag";

import * as Lib from "metabase-lib";

import { COMPARISON_OPERATORS } from "../../config";
import type { OPERATOR } from "../../tokenizer";
import { visit } from "../../visitor";
import { error } from "../utils";

export function checkComparisonOperatorArgs({
  expressionParts,
}: {
  expressionParts: Lib.ExpressionParts | Lib.ExpressionArg;
}) {
  visit(expressionParts, (node) => {
    if (!Lib.isExpressionParts(node)) {
      return;
    }
    const { operator, args } = node;
    if (!COMPARISON_OPERATORS.has(operator as OPERATOR)) {
      return;
    }
    const [firstOperand] = args;
    if (typeof firstOperand === "number") {
      error(node, t`Expecting field but found ${firstOperand}`);
    }
  });
}
