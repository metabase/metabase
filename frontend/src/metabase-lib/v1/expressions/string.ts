import { EDITOR_QUOTES } from "./config";

const DOUBLE_QUOTE = '"';
const SINGLE_QUOTE = "'";
const OPEN_BRACKET = "[";
const CLOSE_BRACKET = "]";
const BACKSLASH = "\\";

export type Quote =
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

export function formatStringLiteral(
  node: string,
  {
    quotes = EDITOR_QUOTES,
  }: {
    quotes?: { literalQuoteDefault: Quote };
  } = {},
) {
  return quoteString(node, quotes.literalQuoteDefault);
}

export function quoteString(string: string, quote: Quote) {
  const [OPEN, CLOSE] = getQuotePair(quote);

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

export function unquoteString(string: string) {
  const quote = string.charAt(0);
  const [OPEN, CLOSE] = getQuotePair(quote);

  let str = "";
  let escaping = false;

  for (let i = 1; i <= string.length - 1; i++) {
    const ch = string[i];

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
      // skip last quote
      return str;
    } else {
      str += ch;
    }
  }

  return str;
}

function getQuotePair(quote: string) {
  if (quote === DOUBLE_QUOTE || quote === SINGLE_QUOTE) {
    return [quote, quote];
  } else if (quote === OPEN_BRACKET) {
    return [OPEN_BRACKET, CLOSE_BRACKET];
  }
  throw new Error("Unknown quoting: " + quote);
}
