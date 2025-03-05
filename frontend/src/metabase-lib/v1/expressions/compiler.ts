import { t } from "ttag";

import * as Lib from "metabase-lib";
import type Database from "metabase-lib/v1/metadata/Database";
import type { Expression } from "metabase-types/api";

import { getMBQLName } from "./config";
import { fieldResolver } from "./field-resolver";
import {
  adjustCaseOrIf,
  adjustMultiArgOptions,
  adjustOffset,
  adjustOptions,
  adjustTopLevelLiterals,
} from "./passes";
import { compile, lexify, parse } from "./pratt";
import { resolve } from "./resolver";
import type { ErrorWithMessage } from "./types";
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
  startRule: string;
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
    adjustTopLevelLiterals,
  ];

  if (shouldResolve) {
    const resolveMBQLField = fieldResolver({
      query,
      stageIndex,
      startRule,
    });
    passes.push(
      (expression: Expression): Expression =>
        resolve({
          expression,
          type: startRule,
          fn: resolveMBQLField,
          database,
        }),
    );
  }

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
