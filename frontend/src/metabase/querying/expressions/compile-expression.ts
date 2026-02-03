import * as Lib from "metabase-lib";

import { type ExpressionError, renderError } from "./errors";
import { compile, lexify, parse } from "./pratt";
import { type Resolver, resolver as defaultResolver } from "./resolver";
import type { Hooks } from "./types";

export type CompileResult =
  | {
      error: ExpressionError;
      expressionParts: null;
      expressionClause: null;
    }
  | {
      error: null;
      expressionParts: Lib.ExpressionParts | Lib.ExpressionArg;
      expressionClause: Lib.ExpressionClause;
    };

export function compileExpression({
  source,
  expressionMode,
  query,
  stageIndex,
  availableColumns,
  availableMetrics,
  resolver = defaultResolver({
    query,
    stageIndex,
    expressionMode,
    availableColumns,
    availableMetrics,
  }),
  hooks = {
    error(error) {
      throw error;
    },
  },
}: {
  source: string;
  expressionMode: Lib.ExpressionMode;
  query: Lib.Query;
  stageIndex: number;
  availableColumns: Lib.ColumnMetadata[];
  availableMetrics?: Lib.MetricMetadata[];
  resolver?: Resolver | null;
  hooks?: Hooks;
}): CompileResult {
  try {
    const tokens = lexify(source);

    hooks.lexified?.({ tokens });

    const root = parse(tokens, { hooks });
    const expressionParts = compile(root, {
      expressionMode,
      resolver,
    });
    const expressionClause = Lib.expressionClause(expressionParts);

    hooks.compiled?.({ expressionClause, expressionParts });

    return {
      expressionParts,
      expressionClause,
      error: null,
    };
  } catch (error) {
    return {
      expressionParts: null,
      expressionClause: null,
      error: renderError(error),
    };
  }
}
