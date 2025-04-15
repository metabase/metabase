import type { SyntaxNodeRef } from "@lezer/common";
import { t } from "ttag";

import { ParseError } from "../errors";
import { quoteString, unquoteString } from "../string";
import { OPERATOR, tokenize } from "../tokenizer";

import {
  ADD,
  BAD_TOKEN,
  BOOLEAN,
  CALL,
  COMMA,
  COMPARISON,
  END_OF_INPUT,
  EQUALITY,
  FIELD,
  GROUP,
  GROUP_CLOSE,
  IDENTIFIER,
  LOGICAL_AND,
  LOGICAL_NOT,
  LOGICAL_OR,
  MULDIV_OP,
  NUMBER,
  STRING,
  SUB,
} from "./syntax";
import { type NodeType, Token } from "./types";

export function lexify(source: string) {
  const lexs: Token[] = [];
  const errors: ParseError[] = [];

  function token(
    node: SyntaxNodeRef,
    token: {
      type: NodeType;
      value?: string;
    },
  ) {
    lexs.push(
      new Token({
        pos: node.from,
        length: node.to - node.from,
        text: source.slice(node.from, node.to),
        ...token,
      }),
    );
    return false;
  }

  function error(node: SyntaxNodeRef, message: string) {
    errors.push(
      new ParseError(message, {
        pos: node.from,
        len: node.to - node.from,
      }),
    );

    return token(node, { type: BAD_TOKEN });
  }

  tokenize(source).iterate(function (node) {
    if (node.type.name === "Identifier") {
      return token(node, {
        type: IDENTIFIER,
      });
    }

    if (node.type.name === "Reference") {
      const text = source.slice(node.from, node.to);
      const value = unquoteString(text);
      if (quoteString(value, "[") !== text) {
        error(node, t`Missing a closing bracket`);
      }

      return token(node, {
        type: FIELD,
        value,
      });
    }

    if (node.type.name === "Number") {
      const value = source.slice(node.from, node.to).toLowerCase();
      const [, exponent, ...rest] = value.split("e");
      if (typeof exponent === "string" && !exponent.match(/[0-9]$/)) {
        error(node, t`Missing exponent`);
      } else if (rest.length > 0) {
        error(node, t`Malformed exponent`);
      }

      return token(node, { type: NUMBER });
    }

    if (node.type.name === "String") {
      const openQuote = source[node.from];
      if (openQuote === "'" || openQuote === '"') {
        const text = source.slice(node.from, node.to);
        const value = unquoteString(text);

        if (quoteString(value, openQuote) !== text) {
          error(node, t`Missing closing quotes`);
        }

        return token(node, {
          type: STRING,
          value,
        });
      }
    }

    if (node.type.name === "Boolean") {
      const op = source.slice(node.from, node.to);
      if (isValidBoolean(op)) {
        return token(node, {
          type: BOOLEAN,
        });
      }
    }

    switch (parseOperator(node.type.name)) {
      case null:
        break;
      case OPERATOR.Comma:
        return token(node, { type: COMMA });
      case OPERATOR.OpenParenthesis: {
        const prev = lexs.at(-1);
        if (prev?.type === IDENTIFIER) {
          prev.type = CALL;
        }
        return token(node, { type: GROUP });
      }
      case OPERATOR.CloseParenthesis:
        return token(node, { type: GROUP_CLOSE });
      case OPERATOR.Plus:
        return token(node, { type: ADD });
      case OPERATOR.Minus:
        return token(node, { type: SUB });
      case OPERATOR.Star:
      case OPERATOR.Slash:
        return token(node, { type: MULDIV_OP });
      case OPERATOR.Equal:
      case OPERATOR.NotEqual:
        return token(node, { type: EQUALITY });
      case OPERATOR.LessThan:
      case OPERATOR.GreaterThan:
      case OPERATOR.LessThanEqual:
      case OPERATOR.GreaterThanEqual:
        return token(node, { type: COMPARISON });
      case OPERATOR.Not:
        return token(node, { type: LOGICAL_NOT });
      case OPERATOR.And:
        return token(node, { type: LOGICAL_AND });
      case OPERATOR.Or:
        return token(node, { type: LOGICAL_OR });
    }

    // Handle parse errors
    if (node.type.name === "⚠") {
      if (node.node.toTree().positions.length === 0 && node.to !== node.from) {
        const text = source.slice(node.from, node.to);

        if (text === "]") {
          // This bracket is closing the previous identifier, but it
          // does not have a matching opening bracket.
          const prev = lexs.at(-1);
          if (prev && prev.type === IDENTIFIER) {
            const name = source.slice(prev.pos, prev.pos + prev.length);
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

  // This simplifies the parser
  lexs.push(
    new Token({
      type: END_OF_INPUT,
      text: "\n",
      length: 1,
      pos: source.length,
    }),
  );

  return {
    tokens: lexs.sort((a, b) => a.pos - b.pos),
    errors,
  };
}

function isValidBoolean(op: string): op is "true" | "false" {
  const lower = op.toLowerCase();
  return lower === "true" || lower === "false";
}

const VALID_OPERATORS = new Set(Object.values(OPERATOR));

function isValidOperator(op: string): op is OPERATOR {
  return VALID_OPERATORS.has(op as OPERATOR);
}

function parseOperator(op: string): OPERATOR | null {
  const lower = op.toLowerCase();
  if (isValidOperator(lower)) {
    return lower;
  }
  return null;
}
