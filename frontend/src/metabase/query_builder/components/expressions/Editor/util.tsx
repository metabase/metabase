import { getFunctionByStructure } from "metabase-lib/v1/expressions/helper-text-strings";
import { TOKEN, tokenize } from "metabase-lib/v1/expressions/tokenizer";
import type { Token } from "metabase-lib/v1/expressions/types";

import { parser } from "./language";

export function enclosingFunction(doc: string, pos: number) {
  const tree = parser.parse(doc);

  const cursor = tree.cursor();
  let res = null;

  do {
    if (
      cursor.name === "CallExpression" &&
      cursor.from <= pos &&
      cursor.to >= pos
    ) {
      const value = doc.slice(cursor.from, cursor.to);
      const structure = value.replace(/\(.*\)?$/, "");

      const args =
        cursor.node.getChildren("ArgList")?.[0]?.getChildren("Arg") ?? [];
      const argIndex = args.findIndex(arg => arg.from <= pos && arg.to >= pos);

      if (value.endsWith(")") && cursor.to === pos) {
        // do not show help when cursor is placed after closing )
        break;
      }

      const fn = getFunctionByStructure(structure);
      if (fn) {
        res = {
          name: fn,
          from: cursor.from,
          to: cursor.to,
          arg:
            argIndex >= 0
              ? {
                  index: argIndex,
                  from: args[argIndex].from,
                  to: args[argIndex].to,
                }
              : null,
        };
      }
    }
  } while (cursor.next());

  return res;
}

export function tokenAtPos(source: string, pos: number): TokenWithText | null {
  const { tokens } = tokenize(source);

  const idx = tokens.findIndex(token => token.start <= pos && token.end >= pos);
  if (idx === -1) {
    return null;
  }

  const token = tokens[idx];
  const prevToken = tokens[idx - 1];

  if (
    prevToken &&
    prevToken.type === TOKEN.String &&
    prevToken.end - prevToken.start === 1
  ) {
    // dangling single- or double-quote
    return null;
  }

  const text = source.slice(token.start, token.end);
  return { ...token, text };
}

export type TokenWithText = Token & { text: string };

export function isIdentifier(token: TokenWithText | null) {
  return token != null && token.type === TOKEN.Identifier;
}

export function isFieldReference(token: TokenWithText | null) {
  return token != null && isIdentifier(token) && token.text.startsWith("[");
}
