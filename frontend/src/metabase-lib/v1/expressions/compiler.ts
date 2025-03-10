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
  isCompilerPass,
} from "./passes";
import { compile, lexify, parse } from "./pratt";
import type { ErrorWithMessage, StartRule } from "./types";
import { isErrorWithMessage } from "./utils";

export type CompileResult =
  | {
      error: ErrorWithMessage;
    }
  | {
      expression: Expression;
      expressionClause: Lib.ExpressionClause;
    };

export function compileExpression({
  source,
  startRule,
  query,
  stageIndex,
  database,
  resolve: shouldResolve = true,
}: {
  source: string;
  startRule: StartRule;
  query: Lib.Query;
  stageIndex: number;
  database?: Database | null;
  resolve?: boolean;
}): CompileResult {
  const tokens = lexify(source);

  const { root, errors } = parse(tokens, {
    throwOnError: false,
  });

  if (errors.length > 0) {
    return { error: errors[0] };
  }

  const passes = [
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
  ].filter(isCompilerPass);

  try {
    let expression = compile(root);
    for (const pass of passes) {
      expression = pass(expression);
    }

    const expressionClause = Lib.expressionClauseForLegacyExpression(
      query,
      stageIndex,
      expression,
    );

    return {
      expression,
      expressionClause,
    };
  } catch (error) {
    if (isErrorWithMessage(error) && error.friendly) {
      return { error };
    }
    return { error: { message: t`Invalid expression` } };
  }
}
