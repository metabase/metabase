import * as Lib from "metabase-lib";

import { type ExpressionError, renderError } from "./errors";
import { compile, lexify, parse } from "./pratt";
import { type Resolver, resolver as defaultResolver } from "./resolver";
import type { StartRule } from "./types";

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
  startRule,
  query,
  stageIndex,
  resolver = defaultResolver({
    query,
    stageIndex,
    startRule,
  }),
}: {
  source: string;
  startRule: StartRule;
  query: Lib.Query;
  stageIndex: number;
  resolver?: Resolver | null;
}): CompileResult {
  try {
    const { tokens } = lexify(source);
    const { root } = parse(tokens, { throwOnError: true });
    const expressionParts = compile(root, {
      startRule,
      resolver,
    });
    const expressionClause = Lib.expressionClause(expressionParts);
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
