import { t } from "ttag";

import * as Lib from "metabase-lib";
import type Database from "metabase-lib/v1/metadata/Database";
import type { Expression } from "metabase-types/api";

import { getMBQLName } from "./config";
import { resolverPass } from "./field-resolver";
import {
  adjustBooleans,
  adjustCaseOrIf,
  adjustMultiArgOptions,
  adjustOffset,
  adjustOptions,
  adjustTopLevelLiteralBooleanFilter,
  //adjustTopLevelLiterals,
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
    pass(adjustTopLevelLiteralBooleanFilter, {
      enabled: startRule === "boolean",
    }),
    resolverPass({
      enabled: shouldResolve,
      database,
      query,
      stageIndex,
      startRule,
    }),
    adjustBooleans,
  ];

  try {
    const expression = compile(root, {
      getMBQLName,
      passes,
    });

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
    console.warn("Error compiling the expression", error);
    if (isErrorWithMessage(error)) {
      return { error };
    }
    return { error: { message: t`Invalid expression` } };
  }
}

function pass(
  pass: (expr: Expression) => Expression,
  { enabled }: { enabled?: boolean },
) {
  if (enabled) {
    return pass;
  }
  return (expression: Expression) => expression;
}
