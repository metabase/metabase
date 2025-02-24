import { t } from "ttag";

import * as Lib from "metabase-lib";
import type Database from "metabase-lib/v1/metadata/Database";
import type { Expression } from "metabase-types/api";

import { getMBQLName } from "./config";
import { fieldResolver } from "./field-resolver";
import { compile, lexify, parse } from "./pratt";
import {
  adjustCaseOrIf,
  adjustMultiArgOptions,
  adjustOffset,
  adjustOptions,
  useShorthands,
} from "./recursive-parser";
import { resolve } from "./resolver";
import type { ErrorWithMessage } from "./types";
import { isErrorWithMessage } from "./utils";

type CompileResult =
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
  name,
  query,
  stageIndex,
  expressionIndex,
  database,
}: {
  source: string;
  startRule: string;
  name: string | null;
  query: Lib.Query;
  stageIndex: number;
  expressionIndex?: number | undefined;
  database?: Database | null;
}): CompileResult {
  const tokens = lexify(source);
  const options = {
    source,
    startRule,
    name,
    query,
    stageIndex,
    expressionIndex,
  };

  // PARSE
  const { root, errors } = parse(tokens, {
    throwOnError: false,
    ...options,
  });

  if (errors.length > 0) {
    return { error: errors[0] };
  }

  const resolveMBQLField = fieldResolver({
    query,
    stageIndex,
    startRule,
  });

  try {
    // COMPILE
    const expression = compile(root, {
      passes: [
        adjustOptions,
        useShorthands,
        adjustOffset,
        adjustCaseOrIf,
        adjustMultiArgOptions,
        expression =>
          resolve({
            expression,
            type: startRule,
            fn: resolveMBQLField,
            database,
          }),
      ],
      getMBQLName,
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
    if (isErrorWithMessage(error)) {
      return { error };
    }
    return { error: { message: t`Invalid expression` } };
  }
}
