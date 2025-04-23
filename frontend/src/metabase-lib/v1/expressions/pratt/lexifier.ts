import type { SyntaxNodeRef } from "@lezer/common";

import { unquoteString } from "../string";
import { PUNCTUATOR, tokenize } from "../tokenizer";

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

  tokenize(source).iterate(function (node) {
    if (node.type.name === "Identifier") {
      return token(node, {
        type: IDENTIFIER,
        value: source.slice(node.from, node.to),
      });
    }

    if (node.type.name === "Field") {
      const text = source.slice(node.from, node.to);
      return token(node, {
        type: FIELD,
        value: unquoteString(text, "["),
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

    if (node.type.name === "Boolean") {
      return token(node, { type: BOOLEAN });
    }

    if (node.type.name === PUNCTUATOR.OpenParenthesis) {
      const prev = lexs.at(-1);
      if (prev?.type === IDENTIFIER) {
        prev.type = CALL;
        delete prev.value;
      }
      return token(node, { type: GROUP });
    }

    const type = parsePunctuator(node.type.name);
    if (type) {
      return token(node, { type });
    }

    // Handle parse errors
    if (
      node.type.name === "⚠" &&
      node.node.toTree().positions.length === 0 &&
      node.to !== node.from
    ) {
      return token(node, { type: BAD_TOKEN });
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

const OPERATOR_TO_TYPE: Record<PUNCTUATOR, NodeType> = {
  [PUNCTUATOR.Comma]: COMMA,
  [PUNCTUATOR.OpenParenthesis]: GROUP,
  [PUNCTUATOR.CloseParenthesis]: GROUP_CLOSE,
  [PUNCTUATOR.Plus]: ADD,
  [PUNCTUATOR.Minus]: SUB,
  [PUNCTUATOR.Multiply]: MULDIV_OP,
  [PUNCTUATOR.Divide]: MULDIV_OP,
  [PUNCTUATOR.Equal]: EQUALITY,
  [PUNCTUATOR.NotEqual]: EQUALITY,
  [PUNCTUATOR.LessThan]: COMPARISON,
  [PUNCTUATOR.GreaterThan]: COMPARISON,
  [PUNCTUATOR.GreaterThanEqual]: COMPARISON,
  [PUNCTUATOR.LessThanEqual]: COMPARISON,
  [PUNCTUATOR.Not]: LOGICAL_NOT,
  [PUNCTUATOR.And]: LOGICAL_AND,
  [PUNCTUATOR.Or]: LOGICAL_OR,
};

export function parsePunctuator(op: string): NodeType | null {
  const lower = op.toLowerCase();
  if (lower in OPERATOR_TO_TYPE) {
    return OPERATOR_TO_TYPE[lower as keyof typeof OPERATOR_TO_TYPE];
  }
  return null;
}
