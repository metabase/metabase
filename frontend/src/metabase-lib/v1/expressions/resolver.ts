import { t } from "ttag";

import * as Lib from "metabase-lib";

import { getClauseDefinition, getMBQLName } from "./config";
import { ResolverError } from "./errors";
import type { ExpressionType } from "./types";
import { getNode } from "./utils";

const MAP_TYPE = {
  boolean: "segment",
  aggregation: "metric",
} as const;

type ResolverFunction = (
  kind: "field" | "segment" | "metric",
  name: string,
  expression?: Lib.ExpressionParts,
) => Lib.ColumnMetadata | Lib.SegmentMetadata | Lib.MetricMetadata;

export function resolve({
  expression,
  type = "expression",
  fn,
}: {
  expression:
    | Lib.ExpressionParts
    | Lib.ColumnMetadata
    | Lib.MetricMetadata
    | Lib.SegmentMetadata;
  type: ExpressionType;
  fn: ResolverFunction;
}):
  | Lib.ExpressionParts
  | Lib.ColumnMetadata
  | Lib.MetricMetadata
  | Lib.SegmentMetadata {
  if (!Lib.isExpressionParts(expression) || expression.operator === "value") {
    return expression;
  }

  const { operator, options, args } = expression;

  // @ts-expect-error: we use dimension internally
  if (operator === "dimension") {
    const kind = MAP_TYPE[type as keyof typeof MAP_TYPE] ?? "dimension";
    const [name] = args;
    if (typeof name !== "string") {
      throw new ResolverError(t`Invalid field name`, getNode(expression));
    }
    try {
      return fn(kind, name, expression);
    } catch (err) {
      // A second chance when field is not found:
      // maybe it is a function with zero argument (e.g. Count, CumulativeCount)
      const operator = getMBQLName(name);
      const clause = operator && getClauseDefinition(operator);
      if (clause && clause?.args.length === 0) {
        return {
          operator,
          options: {},
          args: [],
        };
      }
      throw err;
    }
  }

  const clause = getClauseDefinition(operator);
  if (!clause) {
    throw new ResolverError(
      t`Unknown function ${operator}`,
      getNode(expression),
    );
  }

  return {
    operator,
    options,
    args: args.map((operand, index, args) => {
      if (index >= clause.args.length && !clause.multiple) {
        // as-is, optional object for e.g. ends-with, time-interval, etc
        return operand;
      }
      if (!Lib.isExpressionParts(operand)) {
        return operand;
      }
      return resolve({
        expression: operand,
        type: clause.argType?.(index, args, type) ?? clause.args[index],
        fn,
      });
    }),
  };
}
