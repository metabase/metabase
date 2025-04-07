import { t } from "ttag";

import type { Expression, ExpressionOperand } from "metabase-types/api";

import { FIELD_MARKERS, MBQL_CLAUSES, getMBQLName } from "./config";
import { ResolverError } from "./errors";
import {
  isCallExpression,
  isCaseOrIfOperator,
  isOptionsObject,
  isValue,
} from "./matchers";
import type { ExpressionType } from "./types";
import { getNode } from "./utils";

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
  fn: ResolverFunction;
};

export function resolve(options: Options<Expression>): Expression;
export function resolve(options: Options<ExpressionOperand>): ExpressionOperand;
export function resolve({
  expression,
  type = "expression",
  fn,
}: Options<Expression | ExpressionOperand>): Expression | ExpressionOperand {
  if (!isCallExpression(expression) || isValue(expression)) {
    return expression;
  }

  const [op, ...operands] = expression;

  if (FIELD_MARKERS.has(op)) {
    const kind = MAP_TYPE[type as keyof typeof MAP_TYPE] ?? "dimension";
    const [name] = operands;
    if (typeof name !== "string") {
      throw new ResolverError(t`Invalid field name`, getNode(expression));
    }
    try {
      return fn(kind, name, expression);
    } catch (err) {
      // A second chance when field is not found:
      // maybe it is a function with zero argument (e.g. Count, CumulativeCount)
      const func = getMBQLName(name);
      if (func && MBQL_CLAUSES[func].args.length === 0) {
        return [func];
      }
      throw err;
    }
  }

  const clause = MBQL_CLAUSES[op];
  if (!clause) {
    throw new ResolverError(t`Unknown function ${op}`, getNode(expression));
  }

  return [
    op,
    ...map(op, operands, expression, (operand, index, args) => {
      if (
        (index >= clause.args.length && !clause.multiple) ||
        isOptionsObject(operand)
      ) {
        // as-is, optional object for e.g. ends-with, time-interval, etc
        return operand;
      }

      return resolve({
        expression: operand,
        type: clause.argType?.(index, args, type) ?? clause.args[index],
        fn,
      });
    }),
  ];
}

// Map over operands of case/if expressions, but marshal them first and unmarshal them after
function map(
  op: string,
  operands: (Expression | ExpressionOperand)[],
  expression: Expression,
  fn: (
    operand: Expression | ExpressionOperand,
    index: number,
    args: (Expression | ExpressionOperand)[],
  ) => Expression | ExpressionOperand,
): (Expression | ExpressionOperand)[] {
  const marshalled = marshalOperands(op, operands);
  const mapped = marshalled.map(fn);
  return unmarshalOperands(op, mapped, expression);
}

// Flatten operands of case/if expressions so they can be easily mapped over
function marshalOperands(
  op: string,
  operands: (Expression | ExpressionOperand)[],
): (Expression | ExpressionOperand)[] {
  if (!isCaseOrIfOperator(op)) {
    return operands;
  }

  const pairs = operands[0] as [Expression, Expression][];
  const options = operands[1];
  const res = pairs.flat();

  if (
    isOptionsObject(options) &&
    "default" in options &&
    options.default !== undefined
  ) {
    res.push(options.default as Expression);
  }
  return res;
}

// Unflatten the operands of case/if expressions, as flattened by marshalOperands
function unmarshalOperands(
  op: string,
  operands: (Expression | ExpressionOperand)[],
  expression: Expression,
): (Expression | ExpressionOperand)[] {
  if (!isCaseOrIfOperator(op)) {
    return operands;
  }

  const pairs: [Expression, Expression][] = [];

  const pairCount = operands.length >> 1;
  for (let i = 0; i < pairCount; ++i) {
    const tst = operands[i * 2];
    const val = operands[i * 2 + 1];
    if (isOptionsObject(tst) || isOptionsObject(val)) {
      throw new ResolverError(
        t`Unsupported case/if options`,
        getNode(expression),
      );
    }
    pairs.push([tst, val]);
  }
  if (operands.length > 2 * pairCount) {
    const lastOperand = operands[operands.length - 1];
    const options = isOptionsObject(lastOperand)
      ? lastOperand
      : { default: lastOperand };
    return [pairs, options] as (Expression | ExpressionOperand)[];
  }

  return [pairs] as (Expression | ExpressionOperand)[];
}
