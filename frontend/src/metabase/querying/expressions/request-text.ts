const OPERATOR_WORDS = new Set(["and", "or", "not", "true", "false", "null"]);

/**
 * True when the text reads like a request in words, for example "days between
 * order and delivery", not like an expression that is not finished yet.
 * Expressions do not have two words next to each other, other than operators
 * like "and". Text in quotes and column names in brackets do not count.
 */
export function isRequestText(source: string) {
  const code = source.replace(
    /"(?:[^"\\]|\\.)*"?|'(?:[^'\\]|\\.)*'?|\[[^\]]*\]?/g,
    " ",
  );
  for (const [, first, second] of code.matchAll(
    /([A-Za-z_]\w*)(?=\s+([A-Za-z_]\w*))/g,
  )) {
    if (
      !OPERATOR_WORDS.has(first.toLowerCase()) &&
      !OPERATOR_WORDS.has(second.toLowerCase())
    ) {
      return true;
    }
  }
  return false;
}
