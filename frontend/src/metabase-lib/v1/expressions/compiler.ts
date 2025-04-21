import * as Lib from "metabase-lib";

import { type ExpressionError, renderError } from "./errors";
import { compile, lexify, parse } from "./pratt";
import { type Resolver, resolver as defaultResolver } from "./resolver";
import type { Hooks } from "./types";
import { maybe } from "./utils";

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
  resolver = defaultResolver({
    query,
    stageIndex,
    expressionMode,
  }),
  hooks = {},
}: {
  source: string;
  expressionMode: Lib.ExpressionMode;
  query: Lib.Query;
  stageIndex: number;
  resolver?: Resolver | null;
  hooks?: Hooks;
}): CompileResult {
  try {
    const { tokens } = maybe(lexify(source));
    hooks.lexified?.({ tokens });

    const { root } = maybe(parse(tokens));
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
