import { t } from "ttag";

import type * as Lib from "metabase-lib";
import {
  type ClauseType,
  type StartRule,
  isExpression,
} from "metabase-lib/v1/expressions";
import { diagnoseAndCompile } from "metabase-lib/v1/expressions/diagnostics";
import { getFunctionByStructure } from "metabase-lib/v1/expressions/helper-text-strings";
import { parser } from "metabase-lib/v1/expressions/tokenizer/parser";
import type Metadata from "metabase-lib/v1/metadata/Metadata";

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

export function diagnoseAndCompileExpression<
  S extends StartRule = "expression",
>(
  source: string,
  {
    startRule,
    query,
    stageIndex,
    metadata,
  }: {
    startRule: S;
    query: Lib.Query;
    stageIndex: number;
    metadata: Metadata;
  },
) {
  const result = diagnoseAndCompile({
    source,
    startRule,
    query,
    stageIndex,
    metadata,
  });

  if ("error" in result) {
    return { clause: null, error: result.error };
  }

  const { expression, expressionClause: clause } = result;
  if (!isExpression(expression) || clause === null) {
    return {
      clause: null,
      error: { message: t`Invalid expression` },
    };
  }

  return {
    clause: clause as ClauseType<S>,
    error: null,
  };
}
