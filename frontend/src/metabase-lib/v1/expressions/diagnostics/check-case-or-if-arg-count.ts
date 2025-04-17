import { t } from "ttag";

import * as Lib from "metabase-lib";

import { DiagnosticError } from "../errors";
import { isCaseOrIfOperator } from "../matchers";
import { getToken } from "../utils";
import { visit } from "../visitor";

export function checkCaseOrIfArgCount({
  expressionParts,
}: {
  expressionParts: Lib.ExpressionParts | Lib.ExpressionArg;
}) {
  visit(expressionParts, (node) => {
    if (!Lib.isExpressionParts(node)) {
      return;
    }
    const { operator, args } = node;
    if (!isCaseOrIfOperator(operator)) {
      return;
    }

    if (args.length < 2) {
      throw new DiagnosticError(
        t`${operator.toUpperCase()} expects 2 arguments or more`,
        getToken(node),
      );
    }
  });
}
