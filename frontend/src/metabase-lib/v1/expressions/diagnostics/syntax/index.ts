import type { Token } from "../../pratt";

import { checkBadTokens } from "./check-bad-tokens";
import { checkFieldQuotes } from "./check-field-quotes";
import { checkMatchingParentheses } from "./check-matching-parenthesis";
import { checkMismatchedSiblings } from "./check-mismatched-siblings";
import { checkNumberExponent } from "./check-number-exponent";
import { checkOpenParenthesisAfterFunction } from "./check-open-parenthesis-after-function";
import { checkStringQuotes } from "./check-string-quotes";

export const syntaxChecks = [
  checkOpenParenthesisAfterFunction,
  checkMatchingParentheses,
  checkNumberExponent,
  checkStringQuotes,
  checkFieldQuotes,
  checkMismatchedSiblings,
  checkBadTokens,
];

export function diagnoseExpressionSyntax(options: {
  source: string;
  tokens: Token[];
}) {
  syntaxChecks.forEach((check) => check(options));
}
