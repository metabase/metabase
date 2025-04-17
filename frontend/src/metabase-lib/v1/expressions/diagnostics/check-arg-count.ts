import { msgid, ngettext } from "ttag";

import * as Lib from "metabase-lib";

import { getClauseDefinition } from "../config";
import { DiagnosticError } from "../errors";
import { getToken } from "../utils";
import { visit } from "../visitor";

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
        throw new DiagnosticError(
          ngettext(
            msgid`Function ${displayName} expects at least ${minArgCount} argument`,
            `Function ${displayName} expects at least ${minArgCount} arguments`,
            minArgCount,
          ),
          getToken(node),
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
        throw new DiagnosticError(
          ngettext(
            msgid`Function ${displayName} expects ${expectedArgsLength} argument`,
            `Function ${displayName} expects ${expectedArgsLength} arguments`,
            expectedArgsLength,
          ),
          getToken(node),
        );
      }
    }
  });
}
