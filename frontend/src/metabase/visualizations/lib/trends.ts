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

type ExpressionNode = number | string | [string, ...ExpressionNode[]];

function computeExpression(node: ExpressionNode, x: number): number {
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

export interface TrendLineInsight {
  slope: number;
  offset: number;
  "best-fit"?: ExpressionNode;
}

export const getTrendLineFunction = (insight: TrendLineInsight) => {
  if (insight["best-fit"]) {
    return (x: number) => computeExpression(insight["best-fit"]!, x);
  }
  return (x: number) => x * insight.slope + insight.offset;
};
