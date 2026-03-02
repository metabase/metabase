import type {
  Insight,
  InsightExpression,
  InsightExpressionOperand,
  InsightExpressionOperator,
} from "metabase-types/api";

type ApplyOperator = (...args: number[]) => number;

// mappings of allowed operators
const EXPRESSION_OPERATORS = new Map<InsightExpressionOperator, ApplyOperator>([
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

function computeExpression(
  node: InsightExpression | InsightExpressionOperand,
  x: number,
): number {
  if (Array.isArray(node)) {
    const [operator, ...args] = node;
    if (EXPRESSION_OPERATORS.has(operator)) {
      const operatorFn = EXPRESSION_OPERATORS.get(operator);
      const argValues = args.map((arg) => computeExpression(arg, x));
      if (operatorFn) {
        return operatorFn(...argValues);
      }
    }
  } else if (typeof node === "number") {
    return node;
  } else if (typeof node === "string" && EXPRESSION_IDENTIFIERS.has(node)) {
    return x;
  }
  throw new Error(`Invalid expression: ${node}`);
}

export const getTrendLineFunction = (insight: Insight): ApplyOperator => {
  const bestFit = insight["best-fit"];

  if (bestFit) {
    return (x: number) => computeExpression(bestFit, x);
  }

  return (x: number) => x * insight.slope + insight.offset;
};
