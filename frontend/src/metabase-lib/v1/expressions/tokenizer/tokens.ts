import { ExternalTokenizer } from "@lezer/lr";

import { Reference } from "./lezer.terms";

function char(char: string): number {
  if (char.length !== 1) {
    throw new Error(`Expected a single character, got ${char}`);
  }
  return char.charCodeAt(0);
}

const BACKSLASH = char("\\");
const OPEN_BRACKET = char("[");
const CLOSE_BRACKET = char("]");
const NEW_LINE = char("\n");
const EOF = -1;

const OPERATORS = new Set([
  OPEN_BRACKET,
  char(","),
  char(" "),
  char("("),
  char(")"),
]);

function isOperator(char: number) {
  return OPERATORS.has(char);
}

/**
 * Reference (or bracket idenfiers) like `[User Id]` are parsed differently
 * based on whether they are well-formed or not.
 *
 * This is hard to express in the grammar, so we use this tokenizer to match them.
 */
export const reference = new ExternalTokenizer(input => {
  const current = input.next;

  if (current !== OPEN_BRACKET) {
    return;
  }

  // The first operator we encountered after `[`
  let firstOperator = -1;

  let prev = null;

  for (let idx = 0; ; idx++) {
    prev = input.next;
    const current = input.advance();

    if (current === OPEN_BRACKET) {
      if (prev === BACKSLASH) {
        // an escaped bracket (`\[`), do nothing
        continue;
      }
      // this is another opening bracket that will start a new token,
      // return the current one
      if (prev) {
        input.acceptToken(Reference);
      }
      return;
    }

    if (current === CLOSE_BRACKET) {
      if (prev === BACKSLASH) {
        // an escaped bracket (`\]`), do nothing
        continue;
      }

      // we found the closing bracket, return the token
      input.acceptToken(Reference, 1);
      return;
    }

    if (current === NEW_LINE || current === EOF) {
      // We did not encounter a closing bracket, so
      // find the first operator that was encountered and end the
      // token there.

      if (firstOperator === -1) {
        // No operators were encountered, so return all the text we've
        // seen as the token.
        input.acceptToken(Reference);
        return;
      }
      input.acceptToken(Reference, firstOperator - idx);
      return;
    }

    if (isOperator(current) && firstOperator === -1) {
      firstOperator = idx;
    }
  }
});
