import _ from "underscore";
import moment from "moment";

// mappings of allowed operators
const EXPRESSION_OPERATORS = new Map([
  ["+", (...args) => `(${args.join(" + ")})`],
  ["-", (...args) => `(${args.join(" - ")})`],
  ["*", (...args) => `(${args.join(" * ")})`],
  ["/", (...args) => `(${args.join(" / ")})`],
  ["log", x => `Math.log(${x})`],
  ["pow", (x, y) => `Math.pow(${x}, ${y})`],
  ["exp", x => `Math.pow(Math.E, ${x})`],
]);
// whitelist of allowed expressions
const EXPRESSION_IDENTIFIERS = new Set(["x"]);

function compileNode(node) {
  if (Array.isArray(node)) {
    const [operator, ...args] = node;
    if (EXPRESSION_OPERATORS.has(operator)) {
      return EXPRESSION_OPERATORS.get(operator)(...args.map(compileNode));
    }
  } else if (typeof node === "number") {
    return node;
  } else if (typeof node === "string" && EXPRESSION_IDENTIFIERS.has(node)) {
    return node;
  }
  throw new Error(`Invalid expression: ${node}`);
}

export function compileExpression(node) {
  const compiled = compileNode(node);
  return new Function("x", `return ${compiled};`);
}

const msToDays = ms => ms / (24 * 60 * 60 * 1000);

export function getTrendDataPointsFromInsight(insight, xDomain, count = 10) {
  const isTimeseries = moment.isMoment(xDomain[0]);

  let fn;
  if (insight["best-fit"]) {
    fn = compileExpression(insight["best-fit"]);
  } else {
    fn = x => x * insight.slope + insight.offset;
  }

  const [start, end] = isTimeseries ? xDomain.map(x => +x) : xDomain;
  const xValues = getValuesInRange(start, end, count);

  const trendData = isTimeseries
    ? xValues.map(x => [moment(x), fn(msToDays(x))])
    : xValues.map(x => [x, fn(x)]);

  return trendData;
}

function getValuesInRange(start, end, count) {
  const delta = (end - start) / (count - 1);
  return _.range(start, end, delta).concat([end]);
}
