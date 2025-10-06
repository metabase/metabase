import * as Lib from "metabase-lib";

import { checkExpressionModeSupportsClause } from "../../mode";
import { visit } from "../../visitor";

export function checkFunctionsForExpressionMode({
  expressionParts,
  expressionMode,
}: {
  expressionParts: Lib.ExpressionParts | Lib.ExpressionArg;
  expressionMode: Lib.ExpressionMode;
}) {
  visit(expressionParts, (node) => {
    if (!Lib.isExpressionParts(node)) {
      return;
    }

    if (node.operator === "value") {
      return;
    }

    const error = checkExpressionModeSupportsClause(
      expressionMode,
      node.operator,
    );
    if (error !== null) {
      throw error;
    }
  });
}
