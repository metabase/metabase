import type { SyntaxNode } from "@lezer/common";

import { getMBQLName } from "./clause";
import { END_OF_INPUT, STRING, type Token, lexify } from "./pratt";
import { parser } from "./tokenizer/parser";

export type EnclosingFunctionArg = {
  index: number;
  from: number;
  to: number;
  named?: string;
};

export type EnclosingFunction = {
  name: string;
  from: number;
  to: number;
  arg: EnclosingFunctionArg | null;
};

export function enclosingFunction(
  doc: string,
  pos: number,
): EnclosingFunction | null {
  const tree = parser.parse(doc);

  const cursor = tree.cursor();
  let res: EnclosingFunction | null = null;

  do {
    if (
      cursor.name === "CallExpression" &&
      cursor.from <= pos &&
      cursor.to >= pos
    ) {
      const value = doc.slice(cursor.from, cursor.to);
      const argsIndex = value.indexOf("(") ?? value.length;
      const structure = value.slice(0, argsIndex).trim();

      if (!value.includes("(")) {
        break;
      }

      const args =
        cursor.node.getChildren("ArgList")?.[0]?.getChildren("Arg") ?? [];
      const argIndex = args.findIndex(
        (arg) => arg.from <= pos && arg.to >= pos,
      );

      if (value.endsWith(")") && cursor.to === pos) {
        // do not show help when cursor is placed after closing )
        break;
      }

      const fn = getMBQLName(structure);
      if (fn) {
        res = {
          name: fn,
          from: cursor.from,
          to: cursor.to,
          arg: enclosingFunctionArg(doc, args, argIndex),
        };
      }
    }
  } while (cursor.next());

  return res;
}

function enclosingFunctionArg(
  doc: string,
  args: readonly SyntaxNode[],
  argIndex: number,
): EnclosingFunctionArg | null {
  const argNode = args[argIndex];
  if (!argNode) {
    return null;
  }

  const named = namedArgName(doc, argNode);

  return {
    index: argIndex,
    from: argNode.from,
    to: argNode.to,
    ...(named ? { named } : {}),
  };
}

function namedArgName(doc: string, argNode: SyntaxNode): string | undefined {
  const namedArg = argNode.getChild("NamedArg");
  if (!namedArg) {
    return undefined;
  }

  // Incomplete identifiers are recovered as NamedArg. Require `=>` so a bare
  // `Last` in concat(First, Middle, Last) is not treated as a named argument.
  if (!doc.slice(namedArg.from, namedArg.to).includes("=>")) {
    return undefined;
  }

  const ident = namedArg.getChild("Identifier");
  return ident ? doc.slice(ident.from, ident.to) : undefined;
}

export function tokenAtPos(source: string, pos: number): Token | null {
  const tokens = lexify(source);

  const idx = tokens.findIndex(
    (token) => token.start <= pos && token.end >= pos,
  );
  if (idx === -1) {
    return null;
  }

  const token = tokens[idx];
  const prevToken = tokens[idx - 1];

  if (token.type === END_OF_INPUT) {
    return null;
  }

  if (prevToken && prevToken.type === STRING && prevToken.length === 1) {
    // dangling single- or double-quote
    return null;
  }

  return token;
}
