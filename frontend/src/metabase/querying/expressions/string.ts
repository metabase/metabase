/* eslint-disable @typescript-eslint/no-unused-vars -- used for types */
const DOUBLE_QUOTE = '"';
const SINGLE_QUOTE = "'";
const OPEN_BRACKET = "[";
const CLOSE_BRACKET = "]";
const BACKSLASH = "\\";

export const STRING_LITERAL_DEFAULT_QUOTE = '"';

export type Delimiter =
  | typeof DOUBLE_QUOTE
  | typeof SINGLE_QUOTE
  | typeof OPEN_BRACKET
  | typeof CLOSE_BRACKET;

export type StartDelimiter =
  | typeof DOUBLE_QUOTE
  | typeof SINGLE_QUOTE
  | typeof OPEN_BRACKET;

const STRING_ESCAPE: Record<string, string> = {
  "\b": "\\b",
  "\t": "\\t",
  "\n": "\\n",
  "\f": "\\f",
  "\r": "\\r",
  "\v": "\\v",
};

const STRING_UNESCAPE: Record<string, string> = {
  b: "\b",
  t: "\t",
  n: "\n",
  f: "\f",
  r: "\r",
  v: "\v",
  "'": "'",
  '"': '"',
};

const DELIMITER_PAIRS: Record<StartDelimiter, Delimiter> = {
  "'": "'",
  '"': '"',
  "[": "]",
};

export function formatStringLiteral(
  node: string,
  delimiter: StartDelimiter = STRING_LITERAL_DEFAULT_QUOTE,
) {
  return quoteString(node, delimiter);
}

export function quoteString(string: string, delimiter: StartDelimiter) {
  const OPEN = delimiter;
  assertStartDelimiter(OPEN);
  const CLOSE = DELIMITER_PAIRS[delimiter];

  let str = "";
  for (let i = 0; i < string.length; i++) {
    const ch = string[i];
    if (ch === OPEN || ch === CLOSE) {
      str += BACKSLASH + ch;
    } else if (ch === BACKSLASH && string[i + 1] === BACKSLASH) {
      str += BACKSLASH + BACKSLASH;
      i += 1;
    } else if (ch in STRING_ESCAPE) {
      str += STRING_ESCAPE[ch];
    } else {
      str += ch;
    }
  }

  return OPEN + str + CLOSE;
}

export function unquoteString(
  string: string,
  delimiter: string = string.charAt(0),
) {
  assertStartDelimiter(delimiter);
  const OPEN = delimiter;
  const CLOSE = DELIMITER_PAIRS[OPEN];

  let str = "";
  let escaping = false;

  for (let i = 0; i <= string.length - 1; i++) {
    const ch = string[i];

    if (i === 0 && ch === OPEN) {
      continue;
    }

    if (ch === BACKSLASH && !escaping) {
      escaping = true;
      continue;
    }

    if (escaping) {
      escaping = false;
      if (ch in STRING_UNESCAPE) {
        str += STRING_UNESCAPE[ch];
      } else if (ch === OPEN || ch === CLOSE) {
        str += ch;
      } else {
        str += BACKSLASH + ch;
      }
    } else if (ch === CLOSE) {
      // skip last delimiter
      return str;
    } else {
      str += ch;
    }
  }

  return str;
}

function assertStartDelimiter(str: string): asserts str is StartDelimiter {
  if (str in DELIMITER_PAIRS) {
    return;
  }

  throw new Error(`Unknown string delimiter: ${str}`);
}
