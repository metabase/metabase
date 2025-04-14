import * as Lib from "metabase-lib";
import type { Expression } from "metabase-types/api";

import { type ExpressionError, renderError } from "./errors";
import { resolverPass } from "./field-resolver";
import {
  adjustBigIntLiteral,
  adjustBooleans,
  adjustCaseOrIf,
  adjustMultiArgOptions,
  adjustOffset,
  adjustOptions,
  adjustTopLevelLiteral,
  applyPasses,
} from "./passes";
import { compile, lexify, parse } from "./pratt";
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
    const expression = applyPasses(compiled, [
      adjustOptions,
      adjustOffset,
      adjustMultiArgOptions,
      adjustBigIntLiteral,
      adjustTopLevelLiteral,
      adjustCaseOrIf,
      shouldResolve &&
        resolverPass({
          query,
          stageIndex,
          startRule,
        }),
      adjustBooleans,
    ]);

    const expressionClause = Lib.expressionClauseForLegacyExpression(
      query,
      stageIndex,
      expression,
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
