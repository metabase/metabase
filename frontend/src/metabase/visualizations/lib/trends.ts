import type { Insight, InsightExpressionOperand } from "metabase-types/api";

// mappings of allowed operators
const EXPRESSION_OPERATORS = new Map<string, (...args: number[]) => number>([
  ["+", (...args) => args.reduce((x, y) => x + y)],
  ["-", (...args) => args.reduce((x, y) => x - y)],
  ["*", (...args) => args.reduce((x, y) => x * y)],
  ["/", (...args) => args.reduce((x, y) => x / y)],
  ["log", (x) => Math.log(x)],
  ["pow", (x, y) => Math.pow(x, y)],
  ["exp", (x) => Math.pow(Math.E, x)],
]);
// list of allowed expressions
const EXPRESSION_IDENTIFIERS = new Set(["x"]);

function computeExpression(node: InsightExpressionOperand, x: number): number {
  if (Array.isArray(node)) {
    const [operator, ...args] = node;
    if (EXPRESSION_OPERATORS.has(operator)) {
      const operatorFn = EXPRESSION_OPERATORS.get(operator)!;
      const argValues = args.map((arg) => computeExpression(arg, x));
      return operatorFn(...argValues);
    }
  } else if (typeof node === "number") {
    return node;
  } else if (typeof node === "string" && EXPRESSION_IDENTIFIERS.has(node)) {
    return x;
  }
  throw new Error(`Invalid expression: ${node}`);
}

export const getTrendLineFunction = (insight: Insight) => {
  if (insight["best-fit"]) {
    return (x: number) => computeExpression(insight["best-fit"]!, x);
  }
  return (x: number) => x * insight.slope + insight.offset;
};
