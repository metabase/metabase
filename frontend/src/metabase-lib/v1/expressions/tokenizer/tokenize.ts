import type { SyntaxNodeRef } from "@lezer/common";
import { t } from "ttag";

import type { ErrorWithMessage, Token } from "../types";

import { parser } from "./parser";
import { OPERATOR, type Optional, TOKEN } from "./types";

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

/**
 * Converts a @lezer/lr parse tree into a list of (relevant) tokens.
 */
export function tokenize(expression: string) {
  const tokens: Token[] = [];
  const errors: ErrorWithMessage[] = [];

  const tree = parser.parse(expression);
  const cursor = tree.cursor();

  function token(node: SyntaxNodeRef, token: Optional<Token, "start" | "end">) {
    tokens.push({
      start: node.from,
      end: node.to,
      ...token,
    } as Token);
    return false;
  }

  function error(
    node: SyntaxNodeRef,
    message: string,
    error: Partial<ErrorWithMessage> = {},
  ) {
    errors.push({
      message,
      pos: node.from,
      len: node.to - node.from,
      ...error,
    });
  }

  cursor.iterate(function (node) {
    if (node.type.name === "Identifier") {
      return token(node, {
        type: TOKEN.Identifier,
        isReference: false,
      });
    }

    if (node.type.name === "Reference") {
      const value = expression.slice(node.from, node.to);
      if (value.at(0) !== "[") {
        error(node, t`Missing opening bracket`);
      } else if (value.at(-1) !== "]") {
        error(node, t`Missing a closing bracket`);
      }

      return token(node, {
        type: TOKEN.Identifier,
        isReference: true,
      });
    }

    if (node.type.name === "Number") {
      const value = expression.slice(node.from, node.to).toLowerCase();
      const [, exponent, ...rest] = value.split("e");
      if (typeof exponent === "string" && !exponent.match(/[0-9]$/)) {
        error(node, t`Missing exponent`);
      } else if (rest.length > 0) {
        error(node, t`Malformed exponent`);
      }

      return token(node, { type: TOKEN.Number });
    }

    if (node.type.name === "String") {
      const openQuote = expression[node.from];
      const closeQuote = expression[node.to - 1];
      const penultimate = expression[node.to - 2];
      if (openQuote === "'" || openQuote === '"') {
        if (closeQuote !== openQuote || penultimate === "\\") {
          error(node, t`Missing closing quotes`);
        }

        return token(node, {
          type: TOKEN.String,
          value: expression
            // remove quotes
            .slice(node.from + 1, node.to - 1)
            // expand escape sequences
            .replace(/\\./g, match => {
              const ch = match[1];
              return escapes[ch as keyof typeof escapes] ?? ch;
            }),
        });
      }
    }

    if (node.type.name === "Boolean") {
      const op = expression.slice(node.from, node.to).toLowerCase();
      if (isValidBoolean(op)) {
        return token(node, {
          type: TOKEN.Boolean,
          op,
        });
      }
    }

    const op = parseOperator(node.type.name);
    if (op) {
      return token(node, {
        type: TOKEN.Operator,
        op,
      });
    }

    // Handle parse errors
    if (node.type.name === "⚠") {
      if (node.node.toTree().positions.length === 0 && node.to !== node.from) {
        const text = expression.slice(node.from, node.to);

        if (text === "]") {
          // This bracket is closing the previous identifier, but it
          // does not have a matching opening bracket.
          const prev = tokens.at(-1);
          if (prev && prev.type === TOKEN.Identifier) {
            const name = expression.slice(prev.start, prev.end);
            error(node, `Missing an opening bracket for ${name}`);
          }
          return false;
        }

        if (text.length === 1) {
          error(node, `Invalid character: ${text}`);
          return false;
        }
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
