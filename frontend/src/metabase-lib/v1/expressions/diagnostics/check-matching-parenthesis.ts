import { t } from "ttag";

import { DiagnosticError, type ExpressionError } from "../errors";
import type { Token } from "../pratt";
import { GROUP, GROUP_CLOSE } from "../pratt";

export function checkMatchingParentheses(
  tokens: Token[],
): ExpressionError | null {
  const mismatchedParentheses = countMatchingParentheses(tokens);
  if (mismatchedParentheses === 1) {
    return new DiagnosticError(t`Expecting a closing parenthesis`);
  } else if (mismatchedParentheses > 1) {
    return new DiagnosticError(
      t`Expecting ${mismatchedParentheses} closing parentheses`,
    );
  } else if (mismatchedParentheses === -1) {
    return new DiagnosticError(t`Expecting an opening parenthesis`);
  } else if (mismatchedParentheses < -1) {
    return new DiagnosticError(
      t`Expecting ${-mismatchedParentheses} opening parentheses`,
    );
  }
  return null;
}

const isOpen = (t: Token) => t.type === GROUP;
const isClose = (t: Token) => t.type === GROUP_CLOSE;

// e.g. "COUNTIF(([Total]-[Tax] <5" returns 2 (missing parentheses)
export function countMatchingParentheses(tokens: Token[]) {
  const count = (c: number, token: Token) =>
    isOpen(token) ? c + 1 : isClose(token) ? c - 1 : c;
  return tokens.reduce(count, 0);
}
