import { msgid, ngettext } from "ttag";

import * as Lib from "metabase-lib";

import { getClauseDefinition } from "../../config";
import { visit } from "../../visitor";
import { error } from "../utils";

export function checkArgCount({
  expressionParts,
}: {
  expressionParts: Lib.ExpressionParts | Lib.ExpressionArg;
}) {
  visit(expressionParts, (node) => {
    if (!Lib.isExpressionParts(node)) {
      return;
    }

    const { operator, args: operands } = node;
    const clause = getClauseDefinition(operator);
    if (!clause || operator === "case" || operator === "if") {
      return;
    }

    const { displayName, args, multiple, hasOptions } = clause;

    if (multiple) {
      const argCount = operands.length;
      const minArgCount = args.length;

      if (argCount < minArgCount) {
        error(
          node,
          ngettext(
            msgid`Function ${displayName} expects at least ${minArgCount} argument`,
            `Function ${displayName} expects at least ${minArgCount} arguments`,
            minArgCount,
          ),
        );
      }
    } else {
      const expectedArgsLength = args.length;
      const maxArgCount = hasOptions
        ? expectedArgsLength + 1
        : expectedArgsLength;
      if (
        operands.length < expectedArgsLength ||
        operands.length > maxArgCount
      ) {
        error(
          node,
          ngettext(
            msgid`Function ${displayName} expects ${expectedArgsLength} argument`,
            `Function ${displayName} expects ${expectedArgsLength} arguments`,
            expectedArgsLength,
          ),
        );
      }
    }
  });
}
