import { t } from "ttag";

import * as Lib from "metabase-lib";

import { getClauseDefinition } from "../../clause";
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

    if (expressionMode === "aggregation") {
      return;
    }

    const { operator } = node;
    const clause = getClauseDefinition(operator);
    if (!clause) {
      return;
    }

    if (clause.type === "aggregation") {
      error(
        t`Aggregations like ${clause.displayName} are not allowed when building a custom ${expressionMode}`,
      );
    }
  });
}
