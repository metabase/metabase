import { t } from "ttag";

import type { ErrorWithMessage, Token } from "./types";

export const TOKEN = {
  Operator: 1,
  Number: 2,
  String: 3,
  Identifier: 4,
  Boolean: 5,
};

export const OPERATOR = {
  Comma: ",",
  OpenParenthesis: "(",
  CloseParenthesis: ")",
  Plus: "+",
  Minus: "-",
  Star: "*",
  Slash: "/",
  Equal: "=",
  NotEqual: "!=",
  LessThan: "<",
  GreaterThan: ">",
  LessThanEqual: "<=",
  GreaterThanEqual: ">=",
  Not: "not",
  And: "and",
  Or: "or",
  True: "true",
  False: "false",
};

const parseOperator = (expression: string, index: number) => {
  const character = expression[index];

  switch (character) {
    case OPERATOR.OpenParenthesis:
    case OPERATOR.CloseParenthesis:
    case OPERATOR.Comma:
    case OPERATOR.Plus:
    case OPERATOR.Minus:
    case OPERATOR.Star:
    case OPERATOR.Slash:
    case OPERATOR.Equal:
      return expression.substring(index, index + 1);

    case OPERATOR.LessThan:
    case OPERATOR.GreaterThan:
      if (expression[index + 1] === OPERATOR.Equal) {
        // OPERATOR.LessThanEqual (<=) or
        // OPERATOR.GreaterThanEqual (>=)
        return expression.substring(index, index + 2);
      }

      return expression.substring(index, index + 1);

    case "!":
      if (expression[index + 1] === OPERATOR.Equal) {
        // OPERATOR.NotEqual (!=)
        return expression.substring(index, index + 2);
      }
  }

  return undefined;
};

export function tokenize(expression: string): {
  tokens: Token[];
  errors: ErrorWithMessage[];
} {
  const source = expression;
  const length = expression.length;
  let index = 0;

  const isWhiteSpace = (cp: number) =>
    cp === 0x0009 || // tab
    cp === 0x000a || // line feed
    cp === 0x000b || // vertical tab
    cp === 0x000c || // form feed
    cp === 0x000d || // carriage return
    cp === 0x0020 || // space
    cp === 0x0085 || // next line
    cp === 0x00a0 || // non-breaking space
    cp === 0x1680 || // ogham space
    cp === 0x2000 || // en quad
    cp === 0x2001 || // em quad
    cp === 0x2002 || // en space
    cp === 0x2003 || // em space
    cp === 0x2004 || // third em space
    cp === 0x2005 || // fourth em space
    cp === 0x2006 || // sixth em space
    cp === 0x2007 || // figure space
    cp === 0x2008 || // punctuation space
    cp === 0x2009 || // thin space
    cp === 0x200a || // hair space
    cp === 0x2028 || // line separator
    cp === 0x2029 || // paragraph separator
    cp === 0x202f || // no break narrow space
    cp === 0x205f || // four-eighteenths em space
    cp === 0x3000; // cjk language space

  const isDigit = (cp: number) => cp >= 0x30 && cp <= 0x39; // 0..9

  const isAlpha = (cp: number) =>
    (cp >= 0x41 && cp <= 0x5a) || // A..Z
    (cp >= 0x61 && cp <= 0x7a); // a..z

  const skipWhitespaces = () => {
    while (index < length) {
      const cp = source.charCodeAt(index);
      if (!isWhiteSpace(cp)) {
        break;
      }
      ++index;
    }
  };

  const scanOperator = () => {
    const start = index;
    const op = parseOperator(source, start);

    if (!op) {
      return null;
    }

    index += op.length;

    const type = TOKEN.Operator;
    const end = start + op.length;
    const error = null;
    return { type, op, start, end, error };
  };

  const scanNumericLiteral = () => {
    const start = index;
    while (index < length) {
      const cp = source.charCodeAt(index);
      if (!isDigit(cp)) {
        break;
      }
      ++index;
    }
    const dot = source[index];
    if (dot === ".") {
      ++index;
      while (index < length) {
        const cp = source.charCodeAt(index);
        if (!isDigit(cp)) {
          break;
        }
        ++index;
      }
      // just a dot?
      if (index - start <= 1) {
        index = start;
        return null;
      }
    } else if (index <= start) {
      return null;
    }
    const exp = source[index];
    if (exp === "e" || exp === "E") {
      ++index;
      const sign = source[index];
      if (sign === "+" || sign === "-") {
        ++index;
      }
      const marker = index;
      while (index < length) {
        const cp = source.charCodeAt(index);
        if (!isDigit(cp)) {
          break;
        }
        ++index;
      }
      if (index <= marker) {
        const type = TOKEN.Number;
        const end = index;
        const error = t`Missing exponent`;
        return { type, start, end, error };
      }
    }
    const type = TOKEN.Number;
    const end = index;
    const error = null;
    return { type, start, end, error };
  };

  const scanStringLiteral = () => {
    const start = index;
    const quote = source[start];
    if (quote !== "'" && quote !== '"') {
      return null;
    }
    ++index;
    let value = "";
    while (index < length) {
      const ch = source[index++];
      if (ch === quote) {
        break;
      } else if (ch === "\\") {
        const seq = source[index++];
        if (seq) {
          switch (seq) {
            case "b":
              value += "\b";
              break;
            case "f":
              value += "\f";
              break;
            case "n":
              value += "\n";
              break;
            case "r":
              value += "\r";
              break;
            case "t":
              value += "\t";
              break;
            case "v":
              value += "\x0b";
              break;
            case '"':
              value += '"';
              break;
            default:
              value += seq;
              break;
          }
        }
      } else {
        value += ch;
      }
    }
    const type = TOKEN.String;
    let error = null;

    const terminated = quote === source[index - 1];
    if (!terminated) {
      // unterminated string, rewind after the opening quote
      index = start + 1;
      value = quote;
      error = t`Missing closing quotes`;
    }

    return { type, value, start, end: index, error };
  };

  const scanBracketIdentifier = () => {
    const start = index;
    const bracket = source[start];
    if (bracket !== "[") {
      return null;
    }
    ++index;
    while (index < length) {
      const ch = source[index++];
      if (ch === "]") {
        break;
      } else if (ch === "[") {
        index -= 1; // allow this character to be parsed again, so it can be recognized as a start of another bracket identifier

        let lastNonWhitespaceIndex = index - 1;
        while (
          lastNonWhitespaceIndex > 0 &&
          isWhiteSpace(source.charCodeAt(lastNonWhitespaceIndex))
        ) {
          --lastNonWhitespaceIndex;
        }

        const type = TOKEN.Identifier;
        const end = lastNonWhitespaceIndex + 1;
        const error = t`Bracket identifier in another bracket identifier`;
        return { type, start, end, error };
      } else if (ch === "\\") {
        // ignore the next char, even if it's [ or ]
        index++;
      } else {
        const operator = parseOperator(source, index);

        // if while scanning for bracket identifier we hit an operator not within brackets,
        // then we have an incomplete bracket identifier
        if (operator && !isInsideBracketIdentifier()) {
          const type = TOKEN.Identifier;
          const end = index;
          const error = t`Missing a closing bracket`;

          return { type, start, end, error };
        }
      }
    }
    const type = TOKEN.Identifier;
    const end = index;
    const terminated = source[end - 1] === "]";
    const error = terminated ? null : t`Missing a closing bracket`;
    return { type, start, end, error };
  };

  const isInsideBracketIdentifier = () => {
    for (let i = index + 1; i < length; ++i) {
      const character = source[i];

      if (character === "]") {
        return true;
      }

      if (character === "[") {
        return false;
      }
    }

    return false;
  };

  const isIdentifierStart = (cp: number) => isAlpha(cp) || cp === 0x5f; // underscore;

  const isIdentifierChar = (cp: number) =>
    isAlpha(cp) ||
    isDigit(cp) ||
    cp === 0x2e || // dot
    cp === 0x5f; // underscore

  const scanIdentifier = () => {
    const start = index;
    const initial = source.charCodeAt(start);
    if (!isIdentifierStart(initial)) {
      return null;
    }

    while (index < length) {
      const cp = source.charCodeAt(index);
      if (!isIdentifierChar(cp)) {
        break;
      }
      ++index;
    }
    const end = index;
    if (index === start) {
      return null;
    }
    const id = source.slice(start, end).toLowerCase();
    if (id === OPERATOR.Not || id === OPERATOR.And || id === OPERATOR.Or) {
      const type = TOKEN.Operator;
      const op = id;
      const error = null;
      return { type, op, start, end, error };
    } else if (id === OPERATOR.True || id === OPERATOR.False) {
      const type = TOKEN.Boolean;
      const op = id;
      const error = null;
      return { type, op, start, end, error };
    }
    const type = TOKEN.Identifier;
    const error = null;
    return { type, start, end, error };
  };

  const scanToken = () => {
    return (
      scanOperator() ??
      scanNumericLiteral() ??
      scanStringLiteral() ??
      scanIdentifier() ??
      scanBracketIdentifier()
    );
  };

  const main = () => {
    const tokens = [],
      errors = [];
    while (index < length) {
      skipWhitespaces();
      const token = scanToken();
      if (token) {
        const { error, ...t } = token;
        tokens.push(t);
        if (error) {
          const message = error;
          const pos = t.start;
          const len = t.end - t.start;
          errors.push({ message, pos, len });
        }
      } else {
        const char = source[index];
        if (!char) {
          break;
        }
        const pos = index;
        const len = 1;
        if (char === "]") {
          const prev = tokens[tokens.length - 1];
          const ref =
            prev && prev.type === TOKEN.Identifier
              ? source.slice(prev.start, prev.end)
              : null;
          const message = ref
            ? t`Missing an opening bracket for ${ref}`
            : t`Missing an opening bracket`;
          errors.push({ message, pos, len });
        } else {
          const message = t`Invalid character: ${char}`;
          errors.push({ message, pos, len });
        }
        ++index;
      }
    }
    return { tokens, errors };
  };

  return main();
}
