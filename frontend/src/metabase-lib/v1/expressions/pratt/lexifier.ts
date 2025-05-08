import type { SyntaxNodeRef } from "@lezer/common";

import { parsePunctuator } from "../punctuator";
import { unquoteString } from "../string";
import { tokenize } from "../tokenizer";

import {
  BAD_TOKEN,
  BOOLEAN,
  CALL,
  END_OF_INPUT,
  FIELD,
  IDENTIFIER,
  NUMBER,
  STRING,
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
    const text = source.slice(node.from, node.to);

    if (node.type.name === "Identifier") {
      return token(node, {
        type: IDENTIFIER,
        value: text,
      });
    }

    if (node.type.name === "Field") {
      return token(node, {
        type: FIELD,
        value: unquoteString(text, "["),
      });
    }

    if (node.type.name === "String") {
      return token(node, {
        type: STRING,
        value: unquoteString(text),
      });
    }

    if (node.type.name === "Boolean") {
      return token(node, {
        type: BOOLEAN,
      });
    }

    if (node.type.name === "Number") {
      return token(node, {
        type: NUMBER,
      });
    }

    if (node.type.name === "(") {
      const prev = lexs.at(-1);
      if (prev?.type === IDENTIFIER) {
        prev.type = CALL;
        delete prev.value;
      }
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
      return token(node, {
        type: BAD_TOKEN,
      });
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

  return lexs.sort((a, b) => a.pos - b.pos);
}
