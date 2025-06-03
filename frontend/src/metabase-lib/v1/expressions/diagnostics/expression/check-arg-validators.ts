import * as Lib from "metabase-lib";

import { getClauseDefinition } from "../../clause";
import { visit } from "../../visitor";
import { error } from "../utils";

export function checkArgValidators({
  expressionParts,
}: {
  expressionParts: Lib.ExpressionParts | Lib.ExpressionArg;
}) {
  visit(expressionParts, (node) => {
    if (!Lib.isExpressionParts(node)) {
      return;
    }
    const { operator, args } = node;
    const clause = getClauseDefinition(operator);
    if (!clause) {
      return;
    }

    if (clause.validator) {
      const validationError = clause.validator(...args);
      if (validationError) {
        error(node, validationError);
      }
    }
  });
}
