import { t } from "ttag";

import type * as Lib from "metabase-lib";
import type Metadata from "metabase-lib/v1/metadata/Metadata";

import { type CompileResult, compileExpression } from "../compiler";
import { DiagnosticError, type ExpressionError, renderError } from "../errors";
import { lexify } from "../pratt";

import { checkArgCount } from "./check-arg-count";
import { checkArgValidators } from "./check-arg-validators";
import { checkCaseOrIfArgCount } from "./check-case-or-if-arg-count";
import { checkComparisonOperatorArgs } from "./check-comparison-operator-args";
import { checkKnownFunctions } from "./check-known-functions";
import { checkLibDiagnostics } from "./check-lib-diagnostics";
import { checkMatchingParentheses } from "./check-matching-parenthesis";
import { checkMissingCommasInArgumentList } from "./check-missing-comma-in-argument-list";
import { checkOpenParenthesisAfterFunction } from "./check-open-parenthesis-after-function";
import { checkSupportedFunctions } from "./check-supported-functions";

export function diagnose(options: {
  source: string;
  expressionMode: Lib.ExpressionMode;
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
  expressionMode,
  query,
  stageIndex,
  metadata,
  expressionIndex,
}: {
  source: string;
  expressionMode: Lib.ExpressionMode;
  query: Lib.Query;
  stageIndex: number;
  metadata?: Metadata;
  expressionIndex?: number;
}): CompileResult {
  try {
    diagnoseExpressionSyntax({ source });

    // make a simple check on expression syntax correctness
    const result = compileExpression({
      source,
      expressionMode,
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
      expressionMode,
      expressionClause: result.expressionClause,
      expressionParts: result.expressionParts,
      expressionIndex,
      metadata,
    });

    return result;
  } catch (error) {
    return {
      expression: null,
      expressionClause: null,
      expressionParts: null,
      error: renderError(error),
    };
  }
}

const syntaxChecks = [
  checkOpenParenthesisAfterFunction,
  checkMatchingParentheses,
  checkMissingCommasInArgumentList,
];

export function diagnoseExpressionSyntax({ source }: { source: string }) {
  if (!source || source.length === 0) {
    throw new DiagnosticError(t`Expression is empty`);
  }

  const { tokens, errors } = lexify(source);
  if (errors && errors.length > 0) {
    throw errors[0];
  }

  syntaxChecks.forEach((check) => check(tokens, source));
}

const expressionChecks = [
  checkKnownFunctions,
  checkSupportedFunctions,
  checkArgValidators,
  checkArgCount,
  checkComparisonOperatorArgs,
  checkCaseOrIfArgCount,
  checkLibDiagnostics,
];

export function diagnoseExpression(options: {
  query: Lib.Query;
  stageIndex: number;
  expressionMode: Lib.ExpressionMode;
  expressionClause: Lib.ExpressionClause;
  expressionParts: Lib.ExpressionParts | Lib.ExpressionArg;
  expressionIndex?: number;
  metadata?: Metadata;
}) {
  expressionChecks.forEach((check) => check(options));
}
