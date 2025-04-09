import * as Lib from "metabase-lib";
import type { Expression } from "metabase-types/api";

import { type ExpressionError, renderError } from "./errors";
import { type Resolver, fieldResolver } from "./field-resolver";
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

    const expressionClause = toExpressionClause(query, stageIndex, resolved);

    // TODO: implement these passes previously handled by the resolver
    // - adjust booleans pass

    const expression = Lib.legacyExpressionForExpressionClause(
      query,
      stageIndex,
      expressionClause,
    );

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

function toExpressionClause(
  query: Lib.Query,
  stageIndex: number,
  parts:
    | Lib.ExpressionParts
    | Lib.ColumnMetadata
    | Lib.MetricMetadata
    | Lib.SegmentMetadata,
): Lib.ExpressionClause {
  if (Lib.isExpressionParts(parts)) {
    const { operator, args, options } = parts;
    return Lib.expressionClause(operator, args, options);
  }
  if (
    Lib.isColumnMetadata(parts) ||
    Lib.isMetricMetadata(parts) ||
    Lib.isSegmentMetadata(parts)
  ) {
    const [operator, id, options] = Lib.legacyRef(query, stageIndex, parts);
    const cls = Lib.expressionClause(
      operator as Lib.ExpressionOperator,
      [id],
      options,
    );
    return cls;
  }

  // This case shoul be unreachable
  return Lib.expressionClause("value", [parts]);
}
