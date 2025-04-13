import * as Lib from "metabase-lib";
import type { Expression } from "metabase-types/api";

import { type ExpressionError, renderError } from "./errors";
import { type Resolver, fieldResolver } from "./field-resolver";
import { compile, lexify, parse } from "./pratt";
import type { StartRule } from "./types";

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
  startRule,
  query,
  stageIndex,
  resolver = fieldResolver({
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
    const compiled = compile(root, {
      startRule,
      resolver,
    });
    const expressionClause = Lib.expressionClause(compiled);
    const expression = Lib.legacyExpressionForExpressionClause(
      query,
      stageIndex,
      expressionClause,
    );

    return {
      expression,
      expressionParts: resolved,
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
