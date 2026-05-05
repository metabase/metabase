import { t } from "ttag";

import * as Lib from "metabase-lib";

import { COMPARISON, EQUALITY } from "../../pratt";
import { parsePunctuator } from "../../punctuator";
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
    const type = parsePunctuator(operator);
    if (type !== COMPARISON && type !== EQUALITY) {
      return;
    }

    const [firstOperand] = args;
    if (typeof firstOperand === "number") {
      error(node, t`Expecting field but found ${firstOperand}`);
    }
  });
}
