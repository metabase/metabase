import type * as Lib from "metabase-lib";
import type Metadata from "metabase-lib/v1/metadata/Metadata";

import { compileExpression } from "../compile-expression";
import type { ExpressionError } from "../errors";
import type { Token } from "../pratt";

import { diagnoseExpression } from "./expression";
import { diagnoseExpressionSyntax } from "./syntax";

type Options = {
  source: string;
  expressionMode: Lib.ExpressionMode;
  query: Lib.Query;
  stageIndex: number;
  expressionIndex?: number;
  availableColumns: Lib.ColumnMetadata[];
  availableMetrics?: Lib.MetricMetadata[];
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
