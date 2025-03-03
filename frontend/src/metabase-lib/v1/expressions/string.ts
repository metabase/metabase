import { EDITOR_QUOTES } from "./config";

const DOUBLE_QUOTE = '"';
const SINGLE_QUOTE = "'";
const BACKSLASH = "\\";

const STRING_ESCAPE: Record<string, string> = {
  "\b": "\\b",
  "\t": "\\t",
  "\n": "\\n",
  "\f": "\\f",
  "\r": "\\r",
};

const STRING_UNESCAPE: Record<string, string> = {
  b: "\b",
  t: "\t",
  n: "\n",
  f: "\f",
  r: "\r",
};

export function formatStringLiteral(
  node: string,
  {
    quotes = EDITOR_QUOTES,
  }: {
    quotes?: { literalQuoteDefault: string };
  } = {},
) {
  return quoteString(node, quotes.literalQuoteDefault);
}

export function quoteString(string: string, quote: string) {
  if (quote === DOUBLE_QUOTE || quote === SINGLE_QUOTE) {
    let str = "";
    for (let i = 0; i < string.length; ++i) {
      const ch = string[i];
      if (ch === quote && string[i - 1] !== BACKSLASH) {
        str += BACKSLASH + ch;
      } else {
        const sub = STRING_ESCAPE[ch];
        str += sub ? sub : ch;
      }
    }
    return quote + str + quote;
  } else if (quote === "[") {
    return "[" + escapeString(string) + "]";
  } else if (quote === "") {
    // unquoted
    return string;
  } else {
    throw new Error("Unknown quoting: " + quote);
  }
}

// Return a copy with brackets (`[` and `]`) being escaped
function escapeString(string: string) {
  let str = "";
  for (let i = 0; i < string.length; ++i) {
    const ch = string[i];
    if (ch === "[" || ch === "]") {
      str += "\\";
    }
    str += ch;
  }
  return str;
}

export function unquoteString(string: string) {
  const quote = string.charAt(0);
  if (quote === DOUBLE_QUOTE || quote === SINGLE_QUOTE) {
    let str = "";
    for (let i = 1; i < string.length - 1; ++i) {
      const ch = string[i];
      if (ch === BACKSLASH) {
        const seq = string[i + 1];
        const unescaped = STRING_UNESCAPE[seq];
        if (unescaped) {
          str += unescaped;
          ++i;
          continue;
        }
      }
      str += ch;
    }
    return str;
  } else if (quote === "[") {
    return unescapeString(string).slice(1, -1);
  } else {
    throw new Error("Unknown quoting: " + string);
  }
}

// The opposite of escapeString
export function unescapeString(string: string) {
  let str = "";
  for (let i = 0; i < string.length; ++i) {
    const ch1 = string[i];
    const ch2 = string[i + 1];
    if (ch1 === "\\" && (ch2 === "[" || ch2 === "]")) {
      // skip
    } else {
      str += ch1;
    }
  }
  return str;
}
