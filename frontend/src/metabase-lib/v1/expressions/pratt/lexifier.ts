import type { SyntaxNodeRef } from "@lezer/common";

import { unquoteString } from "../string";
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

  function token(
    node: SyntaxNodeRef,
    token: {
      type: NodeType;
      value?: string;
      pos?: number;
      length?: number;
    },
  ) {
    const { pos = node.from, length = node.to - node.from } = token;
    lexs.push(
      new Token({
        pos,
        length,
        text: source.slice(pos, pos + length),
        ...token,
      }),
    );
    return false;
  }

  tokenize(source).iterate(function (node) {
    if (node.type.name === "Identifier") {
      return token(node, {
        type: IDENTIFIER,
        value: source.slice(node.from, node.to),
      });
    }

    if (node.type.name === "Reference") {
      const text = source.slice(node.from, node.to);
      return token(node, {
        type: FIELD,
        value: unquoteString(text),
      });
    }

    if (node.type.name === "Number") {
      return token(node, { type: NUMBER });
    }

    if (node.type.name === "String") {
      const text = source.slice(node.from, node.to);
      return token(node, {
        type: STRING,
        value: unquoteString(text),
      });
    }

    if (node.type.name === OPERATOR.OpenParenthesis) {
      const prev = lexs.at(-1);
      if (prev?.type === IDENTIFIER) {
        prev.type = CALL;
        delete prev.value;
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
            // replace the token with the merged identifier bracked
            lexs.pop();
            token(node, {
              type: FIELD,
              value: prev.value,
              pos: prev.from,
              length: node.to - prev.from,
            });
            return false;
          }
        }

        return token(node, { type: BAD_TOKEN });
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
