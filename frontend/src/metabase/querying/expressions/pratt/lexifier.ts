import type { SyntaxNodeRef } from "@lezer/common";

import { parsePunctuator } from "../punctuator";
import { unquoteString } from "../string";
import { tokenize } from "../tokenizer";

import type { NodeType } from "./node";
import {
  BAD_TOKEN,
  BOOLEAN,
  CALL,
  END_OF_INPUT,
  FIELD,
  IDENTIFIER,
  NAMED_ARG,
  NUMBER,
  STRING,
} from "./syntax";
import { Token } from "./token";

function mergeAdjacentEqualsGreater(tokens: Token[]): Token[] {
  const merged: Token[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const current = tokens[i];
    const next = tokens[i + 1];
    // Lezer only produces a `=>` node inside a function Arg. Elsewhere the
    // tree is `=` then `>`, so join adjacent tokens into NAMED_ARG.
    if (
      current.text === "=" &&
      next?.text === ">" &&
      current.end === next.start
    ) {
      merged.push(
        new Token({
          type: NAMED_ARG,
          start: current.start,
          end: next.end,
          text: "=>",
        }),
      );
      i += 1;
    } else {
      merged.push(current);
    }
  }
  return merged;
}

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
        start: node.from,
        end: node.to,
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
      start: source.length,
      end: source.length + 1,
    }),
  );

  return mergeAdjacentEqualsGreater(lexs.sort((a, b) => a.start - b.start));
}
