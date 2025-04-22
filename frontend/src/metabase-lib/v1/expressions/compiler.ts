import * as Lib from "metabase-lib";
import type { Expression } from "metabase-types/api";

import { type ExpressionError, renderError } from "./errors";
import { compile, lexify, parse } from "./pratt";
import { type Resolver, resolver as defaultResolver } from "./resolver";

export type CompileResult =
  | {
      error: ExpressionError;
      expression: null;
      expressionParts: null;
      expressionClause: null;
    }
  | {
      error: null;
      expression: Expression;
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
}: {
  source: string;
  expressionMode: Lib.ExpressionMode;
  query: Lib.Query;
  stageIndex: number;
  resolver?: Resolver | null;
}): CompileResult {
  try {
    const { tokens } = lexify(source);
    const { root } = parse(tokens, { throwOnError: true });
    const expressionParts = compile(root, {
      expressionMode,
      resolver,
    });
    const expressionClause = Lib.expressionClause(expressionParts);
    const expression = Lib.legacyExpressionForExpressionClause(
      query,
      stageIndex,
      expressionClause,
    );

    return {
      expression,
      expressionParts,
      expressionClause,
      error: null,
    };
  } catch (error) {
    return {
      expression: null,
      expressionParts: null,
      expressionClause: null,
      error: renderError(error),
    };
  }
}
