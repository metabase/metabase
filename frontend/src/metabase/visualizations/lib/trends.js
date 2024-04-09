import _ from "underscore";

// mappings of allowed operators
const EXPRESSION_OPERATORS = new Map([
  ["+", (...args) => args.reduce((x, y) => x + y)],
  ["-", (...args) => args.reduce((x, y) => x - y)],
  ["*", (...args) => args.reduce((x, y) => x * y)],
  ["/", (...args) => args.reduce((x, y) => x / y)],
  ["log", x => Math.log(x)],
  ["pow", (x, y) => Math.pow(x, y)],
  ["exp", x => Math.pow(Math.E, x)],
]);
// list of allowed expressions
const EXPRESSION_IDENTIFIERS = new Set(["x"]);

function computeExpression(node, x) {
  if (Array.isArray(node)) {
    const [operator, ...args] = node;
    if (EXPRESSION_OPERATORS.has(operator)) {
      const operatorFn = EXPRESSION_OPERATORS.get(operator);
      const argValues = args.map(arg => computeExpression(arg, x));
      return operatorFn(...argValues);
    }
  } else if (typeof node === "number") {
    return node;
  } else if (typeof node === "string" && EXPRESSION_IDENTIFIERS.has(node)) {
    return x;
  }
  throw new Error(`Invalid expression: ${node}`);
}

export const getTrendLineFunction = insight => {
  if (insight["best-fit"]) {
    return x => computeExpression(insight["best-fit"], x);
  }
  return x => x * insight.slope + insight.offset;
};
