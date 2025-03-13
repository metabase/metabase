import { t } from "ttag";

import * as Lib from "metabase-lib";
import type Database from "metabase-lib/v1/metadata/Database";
import type { Expression } from "metabase-types/api";

import { resolverPass } from "./field-resolver";
import {
  adjustBooleans,
  adjustCaseOrIf,
  adjustMultiArgOptions,
  adjustOffset,
  adjustOptions,
  adjustTopLevelLiteral,
  applyPasses,
} from "./passes";
import { compile, lexify, parse } from "./pratt";
import type { ClauseType, ErrorWithMessage, StartRule } from "./types";
import { isErrorWithMessage } from "./utils";

export type CompileResult<S extends StartRule> =
  | {
      error: ErrorWithMessage;
      expression: null;
      expressionClause: null;
    }
  | {
      error: null;
      expression: Expression;
      expressionClause: ClauseType<S>;
    };

export function compileExpression<S extends StartRule>({
  source,
  startRule,
  query,
  stageIndex,
  database,
  resolve: shouldResolve = true,
}: {
  source: string;
  startRule: S;
  query: Lib.Query;
  stageIndex: number;
  database?: Database | null;
  resolve?: boolean;
}): CompileResult<S> {
  const tokens = lexify(source);

  const { root, errors } = parse(tokens, {
    throwOnError: false,
  });

  if (errors.length > 0) {
    return {
      expression: null,
      expressionClause: null,
      error: errors[0],
    };
  }

  try {
    let expression = compile(root);
    expression = applyPasses(expression, [
      adjustOptions,
      adjustOffset,
      adjustCaseOrIf,
      adjustMultiArgOptions,
      adjustTopLevelLiteral,
      shouldResolve &&
        resolverPass({
          database,
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
    ) as ClauseType<S>;

    return {
      expression,
      expressionClause,
      error: null,
    };
  } catch (error) {
    if (isErrorWithMessage(error) && error.friendly) {
      return {
        expression: null,
        expressionClause: null,
        error,
      };
    }
    return {
      expression: null,
      expressionClause: null,
      error: { message: t`Invalid expression` },
    };
  }
}
