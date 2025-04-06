import { t } from "ttag";

import type {
  CaseOptions,
  Expression,
  ExpressionOperand,
} from "metabase-types/api";

import { FIELD_MARKERS, MBQL_CLAUSES, getMBQLName } from "./config";
import { ResolverError } from "./errors";
import {
  isCallExpression,
  isCaseOrIfOperator,
  isOptionsObject,
  isValue,
} from "./matchers";
import type { Node } from "./pratt";
import type { ExpressionType } from "./types";

const MAP_TYPE = {
  boolean: "segment",
  aggregation: "metric",
} as const;

type ResolverFunction = (
  kind: "field" | "segment" | "metric",
  name: string,
  expression?: Expression,
) => Expression;

type Options<T> = {
  expression: T;
  type: ExpressionType;
  fn?: ResolverFunction;
};

export function resolve(options: Options<Expression>): Expression;
export function resolve(options: Options<ExpressionOperand>): ExpressionOperand;
export function resolve({
  expression,
  type = "expression",
  fn = undefined,
}: Options<Expression | ExpressionOperand>): Expression | ExpressionOperand {
  if (!isCallExpression(expression) || isValue(expression)) {
    return expression;
  }

  const [op, ...operands] = expression;

  if (FIELD_MARKERS.has(op)) {
    const kind = MAP_TYPE[type as keyof typeof MAP_TYPE] ?? "dimension";
    const [name] = operands;
    if (fn) {
      try {
        if (typeof name === "string") {
          return fn(kind, name, expression);
        }
        return expression;
      } catch (err) {
        if (typeof name === "string") {
          // A second chance when field is not found:
          // maybe it is a function with zero argument (e.g. Count, CumulativeCount)
          const func = getMBQLName(name.trim().toLowerCase());
          if (func && MBQL_CLAUSES[func].args.length === 0) {
            return [func];
          }
        }
        throw err;
      }
    }
    return [kind, name];
  }

  if (isCaseOrIfOperator(op)) {
    const pairs = operands[0] as [Expression, Expression][];
    const options = operands[1] as CaseOptions | undefined;

    const resolvedPairs = pairs.map(([tst, val]): [Expression, Expression] => [
      resolve({ expression: tst, type: "boolean", fn }),
      resolve({ expression: val, type, fn }),
    ]);

    if (options && "default" in options && options.default !== undefined) {
      const resolvedOptions = {
        default: resolve({ expression: options.default, type, fn }),
      };
      return [op, resolvedPairs, resolvedOptions];
    }

    return [op, resolvedPairs];
  }

  const clause = MBQL_CLAUSES[op];
  if (!clause) {
    throw new ResolverError(t`Unknown function ${op}`, getNode(expression));
  }

  return [
    op,
    ...operands.map((operand, index) => {
      if (
        (index >= clause.args.length && !clause.multiple) ||
        isOptionsObject(operand)
      ) {
        // as-is, optional object for e.g. ends-with, time-interval, etc
        return operand;
      }

      return resolve({
        expression: operand,
        type: clause.argType?.(index, type) ?? clause.args[index],
        fn,
      });
    }),
  ];
}

function getNode(expression: Expression): Node | undefined {
  // @ts-expect-error: we don't know if node was set on expression
  return expression.node;
}
