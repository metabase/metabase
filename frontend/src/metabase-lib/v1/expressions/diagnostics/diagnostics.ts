import type * as Lib from "metabase-lib";
import type Metadata from "metabase-lib/v1/metadata/Metadata";

import { compileExpression } from "../compiler";
import type { ExpressionError } from "../errors";
import type { Token } from "../pratt";

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

type Options = {
  source: string;
  expressionMode: Lib.ExpressionMode;
  query: Lib.Query;
  stageIndex: number;
  expressionIndex?: number;
  metadata?: Metadata;
};

export type SyntaxDiagnoser = (tokens: Token[]) => void;
export type ExpressionDiagnoser = (
  expressionClause: Lib.ExpressionClause,
  expressionParts?: Lib.ExpressionParts | Lib.ExpressionArg,
) => void;

export function diagnoseAndCompile(options: Options) {
  return compileExpression({
    ...options,
    hooks: {
      lexified({ tokens }) {
        diagnoseExpressionSyntax({ source: options.source, tokens });
      },
      compiled({ expressionClause, expressionParts }) {
        diagnoseExpression({ ...options, expressionClause, expressionParts });
      },
      error(error) {
        throw error;
      },
    },
  });
}

export function diagnose(options: Options): ExpressionError | null {
  const result = diagnoseAndCompile(options);
  if (result.error) {
    return result.error;
  }
  return null;
}

const syntaxChecks = [
  checkOpenParenthesisAfterFunction,
  checkMatchingParentheses,
  checkMissingCommasInArgumentList,
];

export function diagnoseExpressionSyntax({
  source,
  tokens,
}: {
  source: string;
  tokens: Token[];
}) {
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
