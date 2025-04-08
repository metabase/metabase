import * as Lib from "metabase-lib";
import type { Expression } from "metabase-types/api";

import { type ExpressionError, renderError } from "./errors";
import { type Resolver, fieldResolver } from "./field-resolver";
import { isLiteral } from "./matchers";
import { compile, lexify, parse } from "./pratt";
import { resolve } from "./resolver";
import type { StartRule } from "./types";

export type CompileResult =
  | {
      error: ExpressionError;
      expression: null;
      expressionClause: null;
    }
  | {
      error: null;
      expression: Expression;
      expressionClause: Lib.ExpressionClause;
    };

export function compileExpression({
  source,
  startRule,
  query,
  stageIndex,
  resolver = fieldResolver({
    query,
    stageIndex,
    startRule,
  }),
}: {
  source: string;
  startRule: StartRule;
  query: Lib.Query;
  stageIndex: number;
  resolver?: Resolver | null;
}): CompileResult {
  try {
    const { tokens } = lexify(source);
    const { root } = parse(tokens, { throwOnError: true });
    const compiled = compile(root);
    const resolved = resolver
      ? resolve({
          expression: compiled,
          type: startRule,
          fn: resolver,
        })
      : compiled;

    const expressionClause = Lib.isExpressionParts(resolved)
      ? Lib.expressionClause(resolved.operator, resolved.args, resolved.options)
      : resolved;

    // TODO: implement these passes previously handled by the resolver
    // - adjust booleans pass

    return {
      expression: legacyExpression({ query, stageIndex, expressionClause }),
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

function legacyExpression({
  query,
  stageIndex,
  expressionClause,
}: {
  query: Lib.Query;
  stageIndex: number;
  expressionClause: Lib.ExpressionClause | Lib.ExpressionArg;
}) {
  if (isLiteral(expressionClause)) {
    return expressionClause;
  }

  const expression = Lib.legacyExpressionForExpressionClause(
    query,
    stageIndex,
    expressionClause,
  );

  if (Lib.isColumnMetadata(expressionClause) && "id" in expression) {
    return ["field", expression.id, { "base-type": expression["base-type"] }];
  }
  if (Lib.isColumnMetadata(expressionClause) && "name" in expression) {
    return [
      "expression",
      expression.name,
      { "base-type": expression["base-type"] },
    ];
  }
  if (Lib.isSegmentMetadata(expressionClause)) {
    return ["segment", expression.id];
  }
  if (Lib.isMetricMetadata(expressionClause)) {
    return ["metric", expression.id];
  }
  return expression;
}
