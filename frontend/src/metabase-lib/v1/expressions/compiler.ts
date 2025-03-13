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
  try {
    const tokens = lexify(source);
    const { root } = parse(tokens, { throwOnError: true });
    const compiled = compile(root);
    const expression = applyPasses(compiled, [
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
    return {
      expression: null,
      expressionClause: null,
      error: renderError(error),
    };
  }
}

function renderError(error: unknown) {
  if (isErrorWithMessage(error) && error.friendly) {
    return error;
  }
  return {
    message: t`Invalid expression`,
    friendly: true,
  };
}
