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
const FIELD_PUNCTUATORS = new Set([char(","), char(" "), char("("), char(")")]);

/**
 * Reference (or bracket identifiers) like `[User Id]` are parsed differently
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
  if (FIELD_PUNCTUATORS.has(current)) {
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
    const current = input.advance();

    if (current === BACKSLASH && !escaping) {
      // and unescaped backslash, next character will be escaped
      escaping = true;
      continue;
    }

    if (current === NEW_LINE || current === EOF) {
      // We did not encounter a closing bracket before hitting a new line or EOF.
      if (!wasOpenedByBracket) {
        // The token we are looking at was not opened by a bracket.
        // It is not a Field token.
        return;
      }

      // The token was opened by a bracket, so we find the first punctuator
      // that might close it (since we didn't find the closing bracket).

      if (firstPunctuator === -1) {
        // No punctuators were encountered, so return all the text we've
        // seen as the token.
        input.acceptToken(Field);
        return;
      }

      // Return the token up to the first punctuator.
      input.acceptToken(Field, firstPunctuator - idx);
      return;
    }

    if (escaping) {
      // any character following a backlash is escaped
      escaping = false;
      continue;
    }

    if (current === OPEN_BRACKET) {
      // this is another opening bracket that will start a new token,
      // return the current one
      if (wasOpenedByBracket) {
        input.acceptToken(Field);
      }
      return;
    }

    if (current === CLOSE_BRACKET) {
      // we found the closing bracket, return the token
      input.acceptToken(Field, 1);
      return;
    }

    if (FIELD_PUNCTUATORS.has(current) && firstPunctuator === -1) {
      if (!wasOpenedByBracket) {
        // The token we are looking at was not opened by a bracket
        // and we did not encounter a closing bracket before hitting a punctuator.
        // It is not a Field token.
        return;
      }

      // We encountered a punctuator after an opening bracket. Store its location and
      // keep looking for the closing bracket.
      firstPunctuator = idx;
    }
  }
});
