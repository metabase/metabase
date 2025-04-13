import { t } from "ttag";

import * as Lib from "metabase-lib";
import type Metadata from "metabase-lib/v1/metadata/Metadata";
import type { Expression } from "metabase-types/api";

import { type CompileResult, compileExpression } from "../compiler";
import { DiagnosticError, type ExpressionError, renderError } from "../errors";
import { lexify } from "../pratt";
import type { StartRule } from "../types";
import { getExpressionMode } from "../utils";

import { checkArgCount } from "./check-arg-count";
import { checkArgValidators } from "./check-arg-validators";
import { checkCaseOrIfArgCount } from "./check-case-or-if-arg-count";
import { checkComparisonOperatorArgs } from "./check-comparison-operator-args";
import { checkKnownFunctions } from "./check-known-functions";
import { checkMatchingParentheses } from "./check-matching-parenthesis";
import { checkMissingCommasInArgumentList } from "./check-missing-comma-in-argument-list";
import { checkOpenParenthesisAfterFunction } from "./check-open-parenthesis-after-function";
import { checkSupportedFunctions } from "./check-supported-functions";

export function diagnose(options: {
  source: string;
  startRule: StartRule;
  query: Lib.Query;
  stageIndex: number;
  expressionIndex?: number;
  metadata?: Metadata;
}): ExpressionError | null {
  const result = diagnoseAndCompile(options);
  if (result.error) {
    return result.error;
  }
  return null;
}

export function diagnoseAndCompile({
  source,
  startRule,
  query,
  stageIndex,
  metadata,
  expressionIndex,
}: {
  source: string;
  startRule: StartRule;
  query: Lib.Query;
  stageIndex: number;
  metadata?: Metadata;
  expressionIndex?: number;
}): CompileResult {
  try {
    if (!source || source.length === 0) {
      throw new DiagnosticError(t`Expression is empty`);
    }

    const { tokens, errors } = lexify(source);
    if (errors && errors.length > 0) {
      throw errors[0];
    }

    const checks = [
      checkOpenParenthesisAfterFunction,
      checkMatchingParentheses,
      checkMissingCommasInArgumentList,
    ];

    for (const check of checks) {
      const error = check(tokens, source);
      if (error) {
        throw error;
      }
    }

    // make a simple check on expression syntax correctness
    const result = compileExpression({
      source,
      startRule,
      query,
      stageIndex,
    });

    if (result.expression === null || result.expressionClause === null) {
      const error = result.error ?? new DiagnosticError(t`Invalid expression`);
      throw error;
    }

    diagnoseExpression({
      query,
      stageIndex,
      startRule,
      expression: result.expression,
      expressionIndex,
      metadata,
    });

    return result;
  } catch (error) {
    return {
      expression: null,
      expressionClause: null,
      error: renderError(error),
    };
  }
}

export function diagnoseExpression({
  query,
  stageIndex,
  startRule,
  expression,
  expressionIndex,
  metadata,
}: {
  query: Lib.Query;
  stageIndex: number;
  startRule: StartRule;
  expression: Expression;
  expressionIndex?: number;
  metadata?: Metadata;
}) {
  const checkers = [
    checkKnownFunctions,
    checkSupportedFunctions,
    checkArgValidators,
    checkArgCount,
    checkComparisonOperatorArgs,
    checkCaseOrIfArgCount,
  ];
  for (const checker of checkers) {
    checker({ expression, query, metadata });
  }

  const error = Lib.diagnoseExpression(
    query,
    stageIndex,
    getExpressionMode(startRule),
    expression,
    expressionIndex,
  );

  if (error) {
    throw new DiagnosticError(error.message, {
      friendly: Boolean(error.friendly),
    });
  }
}
