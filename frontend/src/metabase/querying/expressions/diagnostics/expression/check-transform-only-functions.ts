import { t } from "ttag";

import * as Lib from "metabase-lib";

import { visit } from "../../visitor";
import { error } from "../utils";

export function checkTransformOnlyFunctions({
  expressionParts,
  allowTransformOnlyFunctions,
}: {
  expressionParts: Lib.ExpressionParts | Lib.ExpressionArg;
  allowTransformOnlyFunctions?: boolean;
}) {
  if (allowTransformOnlyFunctions) {
    return;
  }

  visit(expressionParts, (node) => {
    if (!Lib.isExpressionParts(node)) {
      return;
    }
    if (node.operator === "prompt") {
      error(node, t`prompt() is only available in transforms`);
    }
  });
}
