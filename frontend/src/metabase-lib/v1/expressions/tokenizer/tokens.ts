import { ExternalTokenizer } from "@lezer/lr";

import { Field } from "./lezer.terms";

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

// The characters that will delimit a field name that
// is not properly closed.
//
// For example, the underlined bit will be parsed as a field token:
//
//   [Field Name
//   ------
//
const FIELD_PUNCTUATORS = new Set([
  OPEN_BRACKET,
  char(","),
  char(" "),
  char("("),
  char(")"),
]);

/**
 * Reference (or bracket idenfiers) like `[User Id]` are parsed differently
 * based on whether they are well-formed or not.
 *
 * We allow malformed field tokens (ie. tokens without proper quoting) to be parsed as well.
 * For example, the following will all be parsed as a field token:
 *
 * [Foo
 * Foo]
 * [Foo]
 *
 * This is hard to express in the grammar, so we use this tokenizer to match them.
 */
export const field = new ExternalTokenizer((input) => {
  const current = input.next;

  // We allow any character to potentially start a Field token, except field-delimiting
  // punctuators.
  if (FIELD_PUNCTUATORS.has(current) && current !== OPEN_BRACKET) {
    return;
  }

  // We keep track of whether the token we are looking at was opened by a bracket.
  const wasOpenedByBracket = current === OPEN_BRACKET;

  // The first punctuator we encountered after the opening bracket.
  // If we don't encounter a closing bracket before hitting a new line or EOF,
  // this will delimit the field token.
  let firstPunctuator = -1;

  // Characters can be escaped with a backslash
  let escaping = false;

  for (let idx = 0; ; idx++) {
    const prev = input.next;
    const current = input.advance();

    if (current === BACKSLASH && !escaping) {
      // first backslash, next character will be escaped
      escaping = true;
      continue;
    }

    if (current === OPEN_BRACKET) {
      if (escaping) {
        // an escaped bracket (`\[`), keep looking for the closing bracket
        escaping = false;
        continue;
      }
      // this is another opening bracket that will start a new token,
      // return the current one
      if (prev && wasOpenedByBracket) {
        input.acceptToken(Field);
      }
      return;
    }

    if (current === CLOSE_BRACKET) {
      if (escaping) {
        // an escaped bracket (ie `\]`), keep looking for the closing bracket
        escaping = false;
        continue;
      }

      // we found the closing bracket, return the token
      input.acceptToken(Field, 1);
      return;
    }

    if (current === NEW_LINE || current === EOF) {
      if (!wasOpenedByBracket) {
        // The token we are looking at was not opened by a bracket
        // and we did not encounter a closing bracket before hitting a new line or EOF.
        // It is not a Field token.
        return;
      }

      // We did not encounter a closing bracket, so
      // find the first operator that was encountered and end the
      // token there.

      if (firstPunctuator === -1) {
        // No operators were encountered, so return all the text we've
        // seen as the token.
        input.acceptToken(Field);
        return;
      }
      input.acceptToken(Field, firstPunctuator - idx);
      return;
    }

    if (FIELD_PUNCTUATORS.has(current) && firstPunctuator === -1) {
      if (!wasOpenedByBracket) {
        // The token we are looking at was not opened by a bracket
        // and we did not encounter a closing bracket before hitting a punctuator.
        // It is not a Field token.
        return;
      }

      // We encountered a punctuator after an opening bracket store it's location and
      // keep looking for the closing bracket.
      firstPunctuator = idx;
    }
  }
});
