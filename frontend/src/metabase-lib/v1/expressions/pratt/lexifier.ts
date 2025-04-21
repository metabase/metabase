import type { SyntaxNodeRef } from "@lezer/common";
import { t } from "ttag";

import { ParseError } from "../errors";
import { quoteString, unquoteString } from "../string";
import { OPERATOR, tokenize } from "../tokenizer";
import type { Hooks } from "../types";

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

export function lexify(source: string, { hooks }: { hooks?: Hooks } = {}) {
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
    const error = new ParseError(message, {
      pos: node.from,
      len: node.to - node.from,
    });
    hooks?.error?.(error);
    errors.push(error);
    return token(node, { type: BAD_TOKEN });
  }

  tokenize(source).iterate(function (node) {
    if (node.type.name === "Identifier") {
      return token(node, { type: IDENTIFIER });
    }

    if (node.type.name === "Reference") {
      const text = source.slice(node.from, node.to);
      const value = unquoteString(text);
      if (quoteString(value, "[") !== text) {
        error(node, t`Missing a closing bracket`);
      }

      return token(node, { type: FIELD, value });
    }

    if (node.type.name === "Number") {
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

        return token(node, { type: STRING, value });
      } else {
        return error(node, t`Unsupported string quote: ${openQuote}`);
      }
    }

    if (node.type.name === OPERATOR.OpenParenthesis) {
      const prev = lexs.at(-1);
      if (prev?.type === IDENTIFIER) {
        prev.type = CALL;
      }
      return token(node, { type: GROUP });
    }

    const type = parseOperatorType(node.type.name);
    if (type) {
      return token(node, { type });
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
            error(node, t`Missing an opening bracket for ${name}`);
          }
          return false;
        }

        if (text.length === 1) {
          error(node, t`Invalid character: ${text}`);
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

const OPERATOR_TO_TYPE: Record<OPERATOR, NodeType> = {
  [OPERATOR.Comma]: COMMA,
  [OPERATOR.OpenParenthesis]: GROUP,
  [OPERATOR.CloseParenthesis]: GROUP_CLOSE,
  [OPERATOR.Plus]: ADD,
  [OPERATOR.Minus]: SUB,
  [OPERATOR.Star]: MULDIV_OP,
  [OPERATOR.Slash]: MULDIV_OP,
  [OPERATOR.Equal]: EQUALITY,
  [OPERATOR.NotEqual]: EQUALITY,
  [OPERATOR.LessThan]: COMPARISON,
  [OPERATOR.GreaterThan]: COMPARISON,
  [OPERATOR.GreaterThanEqual]: COMPARISON,
  [OPERATOR.LessThanEqual]: COMPARISON,
  [OPERATOR.Not]: LOGICAL_NOT,
  [OPERATOR.And]: LOGICAL_AND,
  [OPERATOR.Or]: LOGICAL_OR,
  [OPERATOR.True]: BOOLEAN,
  [OPERATOR.False]: BOOLEAN,
};

function parseOperatorType(op: string): NodeType | null {
  const lower = op.toLowerCase();
  if (lower in OPERATOR_TO_TYPE) {
    return OPERATOR_TO_TYPE[lower as keyof typeof OPERATOR_TO_TYPE];
  }
  return null;
}
