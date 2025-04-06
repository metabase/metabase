import * as Lib from "metabase-lib";
import type { Expression } from "metabase-types/api";

import { type ExpressionError, renderError } from "./errors";
import { fieldResolver } from "./field-resolver";
import { compile, lexify, parse } from "./pratt";
import { resolve } from "./resolver";
import type { StartRule } from "./types";

export type CompileResult =
  | {
      error: ExpressionError;
      expression: null;
      expressionClause: null;
    }
  | {
      error: null;
      expression: Expression;
      expressionClause: Lib.ExpressionClause;
    };

export function compileExpression({
  source,
  startRule,
  query,
  stageIndex,
  resolve: shouldResolve = true,
}: {
  source: string;
  startRule: StartRule;
  query: Lib.Query;
  stageIndex: number;
  resolve?: boolean;
}): CompileResult {
  try {
    const { tokens } = lexify(source);
    const { root } = parse(tokens, { throwOnError: true });
    const compiled = compile(root);
    const resolved = shouldResolve
      ? resolve({
          expression: compiled,
          type: startRule,
          fn: fieldResolver({
            query,
            stageIndex,
            startRule,
          }),
        })
      : compiled;

    const expressionClause = Lib.isExpressionParts(resolved)
      ? Lib.expressionClause(resolved.operator, resolved.args, resolved.options)
      : resolved;

    // TODO: implement these passes previously handled by the resolver
    // - adjust booleans pass

    const expression = Lib.legacyExpressionForExpressionClause(
      query,
      stageIndex,
      expressionClause,
    );

    return {
      expression,
      expressionClause,
      error: null,
    };
  } catch (error) {
    return {
      expression: null,
      expressionClause: null,
      error: renderError(error),
    };
  }
}
