import { t } from "ttag";

import { OPERATOR, TOKEN } from "../tokenizer";
import type { ErrorWithMessage, Token } from "../types";

import { parser } from "./parser";

const escapes = {
  '"': '"',
  "'": "'",
  b: "\b",
  f: "\f",
  n: "\n",
  r: "\r",
  t: "\t",
  v: "\x0b",
};

export function tokenize(expression: string) {
  const tokens: Token[] = [];
  const errors: ErrorWithMessage[] = [];

  const tree = parser.parse(expression);
  const cursor = tree.cursor();

  cursor.iterate(function (node) {
    if (node.type.name === "Identifier") {
      tokens.push({
        type: TOKEN.Identifier,
        start: node.from,
        end: node.to,
        isReference: false,
      });
      return;
    }
    if (node.type.name === "Reference") {
      const value = expression.slice(node.from, node.to);
      if (value.at(0) !== "[") {
        errors.push({
          message: t`Missing opening bracket`,
          pos: node.from,
          len: node.to - node.from,
        });
      }
      if (value.at(-1) !== "]") {
        errors.push({
          message: t`Missing a closing bracket`,
          pos: node.from,
          len: node.to - node.from,
        });
      }

      tokens.push({
        type: TOKEN.Identifier,
        start: node.from,
        end: node.to,
        isReference: true,
      });
      return;
    }
    if (node.type.name === "Number") {
      const value = expression.slice(node.from, node.to).toLowerCase();
      const [_, exponent, ...rest] = value.split("e");
      if (typeof exponent === "string" && !exponent.match(/[0-9]$/)) {
        errors.push({
          message: t`Missing exponent`,
          pos: node.from,
          len: node.from - node.to,
        });
      }
      if (rest.length > 0) {
        errors.push({
          message: t`Malformed exponent`,
          pos: node.from,
          len: node.from - node.to,
        });
      }

      tokens.push({
        type: TOKEN.Number,
        start: node.from,
        end: node.to,
      });
      return;
    }
    if (node.type.name === "String") {
      const openQuote = expression[node.from];
      const closeQuote = expression[node.to - 1];
      const penultimate = expression[node.to - 2];
      if (closeQuote !== openQuote || penultimate === "\\") {
        errors.push({
          message: t`Missing closing quotes`,
          pos: node.from,
          len: 1,
        });
      }

      const value = expression
        .slice(node.from + 1, node.to - 1)
        .replace(/\\./g, match => {
          const ch = match[1];
          return escapes[ch as keyof typeof escapes] ?? ch;
        });

      tokens.push({
        type: TOKEN.String,
        start: node.from,
        end: node.to,
        value,
      });
      return;
    }
    if (node.type.name === "Boolean") {
      const op = expression.slice(node.from, node.to).toLowerCase();
      if (isValidBoolean(op)) {
        tokens.push({
          type: TOKEN.Boolean,
          op,
          start: node.from,
          end: node.to,
        });
      }
      return;
    }

    const op = parseOperator(node.type.name);
    if (op) {
      tokens.push({
        type: TOKEN.Operator,
        op,
        start: node.from,
        end: node.to,
      });
      return;
    }

    if (node.type.name === "⚠") {
      if (node.node.toTree().positions.length === 0 && node.to !== node.from) {
        const text = expression.slice(node.from, node.to);

        if (text === "]") {
          // This bracket is closing the previous identifier, but it
          // does not have a matching opening bracket.
          const prev = tokens.at(-1);
          if (prev && prev.type === TOKEN.Identifier) {
            const name = expression.slice(prev.start, prev.end);
            errors.push({
              message: `Missing an opening bracket for ${name}`,
              pos: node.from,
              len: node.to - node.from,
            });
          }
          return;
        }
        errors.push({
          message: `Invalid character: ${text}`,
          pos: node.from,
          len: node.to - node.from,
        });
      }
    }
  });

  return { tokens, errors };
}

const VALID_OPERATORS = new Set(Object.values(OPERATOR));

function isValidOperator(op: string): op is OPERATOR {
  return VALID_OPERATORS.has(op as OPERATOR);
}

function isValidBoolean(op: string): op is "true" | "false" {
  return op === "true" || op === "false";
}

function parseOperator(op: string): OPERATOR | null {
  const lower = op.toLowerCase();
  if (isValidOperator(lower)) {
    return lower;
  }
  return null;
}
