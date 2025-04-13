import { msgid, ngettext } from "ttag";

import type { Expression } from "metabase-types/api";

import { getClauseDefinition } from "../config";
import { DiagnosticError } from "../errors";
import { isCallExpression, isOptionsObject } from "../matchers";
import { getToken } from "../utils";
import { visit } from "../visitor";

export function checkArgCount({ expression }: { expression: Expression }) {
  visit(expression, (node) => {
    if (!isCallExpression(node)) {
      return;
    }

    const [name, ...operands] = node;
    const clause = getClauseDefinition(name);
    if (!clause || name === "case" || name === "if") {
      return;
    }

    const { displayName, args, multiple, hasOptions } = clause;

    const filtered = operands.filter(
      (arg) => !isOptionsObject(arg) && arg !== null,
    );

    if (multiple) {
      const argCount = filtered.length;
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
        filtered.length < expectedArgsLength ||
        filtered.length > maxArgCount
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
