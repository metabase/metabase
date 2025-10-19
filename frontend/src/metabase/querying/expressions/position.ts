import { getMBQLName } from "./clause";
import { END_OF_INPUT, STRING, type Token, lexify } from "./pratt";
import { parser } from "./tokenizer/parser";

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
