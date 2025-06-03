import * as Lib from "metabase-lib";

import { ExpressionError } from "../../errors";
import { assertModeSupportsClause } from "../../mode";
import { visit } from "../../visitor";
import { error } from "../utils";

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

    try {
      assertModeSupportsClause(expressionMode, node.operator);
    } catch (err) {
      if (err instanceof ExpressionError) {
        error(node, err.message);
      }
      throw err;
    }
  });
}
