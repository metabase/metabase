import { t } from "ttag";

import * as Lib from "metabase-lib";

import { FIELD_MARKERS, getClauseDefinition } from "../../config";
import { visit } from "../../visitor";
import { error } from "../utils";

export function checkKnownFunctions({
  expressionParts,
}: {
  expressionParts: Lib.ExpressionParts | Lib.ExpressionArg;
}) {
  visit(expressionParts, (node) => {
    if (!Lib.isExpressionParts(node)) {
      return;
    }

    const { operator } = node;
    if (FIELD_MARKERS.has(operator) || operator === "value") {
      return;
    }

    const clause = getClauseDefinition(operator);
    if (!clause) {
      error(node, t`Unknown function ${operator}`);
    }
  });
}
