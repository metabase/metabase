import { msgid, ngettext } from "ttag";

import * as Lib from "metabase-lib";

import { getClauseDefinition } from "../../clause";
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

    const { displayName, multiple, hasOptions } = clause;
    const args = clause.args.filter((arg) => !arg.optional);

    if (multiple) {
      const argCount = operands.length;
      const minArgCount = args.length;

      if (argCount < minArgCount) {
        error(
          node,
          ngettext(
            msgid`${displayName}() needs at least ${minArgCount} value inside its parentheses.`,
            `${displayName}() needs at least ${minArgCount} values, separated by commas.`,
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
            msgid`${displayName}() needs ${expectedArgsLength} value inside its parentheses.`,
            `${displayName}() needs ${expectedArgsLength} values, separated by commas.`,
            expectedArgsLength,
          ),
        );
      }
    }
  });
}
