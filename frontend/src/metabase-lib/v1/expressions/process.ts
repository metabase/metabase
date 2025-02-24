import { t } from "ttag";

import * as Lib from "metabase-lib";
import type { Expression } from "metabase-types/api";

import { fieldResolver } from "./field-resolver";
import { adjustBooleans, parse } from "./recursive-parser";
import { resolve } from "./resolver";

export function processSource(options: {
  source: string;
  query: Lib.Query;
  stageIndex: number;
  startRule: string;
  expressionIndex?: number | undefined;
  name?: string;
}): {
  source: string;
  expression: Expression | null;
  expressionClause: Lib.ExpressionClause | null;
  compileError: Error | null;
} {
  const { source, query, stageIndex, startRule } = options;

  const resolveMBQLField = fieldResolver({
    query,
    stageIndex,
    startRule,
  });

  let expression = null;
  let expressionClause = null;
  let compileError = null;
  try {
    const parsed = parse(source);
    expression = adjustBooleans(
      resolve({ expression: parsed, type: startRule, fn: resolveMBQLField }),
    );

    // query and stageIndex are not available outside of notebook editor (e.g. in Metrics or Segments).
    if (query && typeof stageIndex !== "undefined") {
      expressionClause = Lib.expressionClauseForLegacyExpression(
        query,
        stageIndex,
        expression,
      );
    }
  } catch (e) {
    console.warn("compile error", e);
    if (e instanceof Error) {
      compileError = e;
    } else {
      compileError = new Error(t`Unknown error`);
    }
  }

  return {
    source,
    expression,
    expressionClause,
    compileError,
  };
}
