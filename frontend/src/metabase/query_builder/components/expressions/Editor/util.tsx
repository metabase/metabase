import { doesFunctionNameExist } from "metabase-lib/v1/expressions/helper-text-strings";

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
      const name = value.replace(/\(.*\)?$/, "");

      if (value.endsWith(")") && cursor.to === pos) {
        // do not show help when cursor is placed after closing )
        break;
      }

      if (doesFunctionNameExist(name)) {
        res = {
          name,
          from: cursor.from,
          to: cursor.to,
        };
      }
    }
  } while (cursor.next());

  return res;
}
