import { t } from "ttag";

import type * as Lib from "metabase-lib";
import { isExpression } from "metabase-lib/v1/expressions";
import { diagnose } from "metabase-lib/v1/expressions/diagnostics";
import { getFunctionByStructure } from "metabase-lib/v1/expressions/helper-text-strings";
import { processSource } from "metabase-lib/v1/expressions/process";
import { parser } from "metabase-lib/v1/expressions/tokenizer/parser";
import type Metadata from "metabase-lib/v1/metadata/Metadata";

import type { ClauseType, StartRule } from "../types";

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
    expressionIndex,
    metadata,
    name,
  }: {
    startRule: S;
    query: Lib.Query;
    stageIndex: number;
    expressionIndex?: number;
    metadata: Metadata;
    name?: string;
  },
) {
  if (source.trim() === "") {
    return {
      clause: null,
      error: { message: t`Invalid expression` },
    };
  }

  const error = diagnose({
    source,
    startRule,
    query,
    stageIndex,
    expressionIndex,
    metadata,
  });

  if (error) {
    return { clause: null, error };
  }

  const compiledExpression = processSource({
    source,
    query,
    stageIndex,
    startRule,
    expressionIndex,
    name,
  });

  const {
    expression,
    expressionClause: clause,
    compileError,
  } = compiledExpression;
  if (
    compileError &&
    typeof compileError === "object" &&
    "message" in compileError &&
    typeof compileError.message === "string"
  ) {
    return {
      clause: null,
      error: compileError,
    };
  }

  if (compileError || !expression || !isExpression(expression) || !clause) {
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
