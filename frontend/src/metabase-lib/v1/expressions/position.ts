import { getMBQLName } from "./clause";
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
