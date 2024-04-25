import moment from "moment-timezone"; // eslint-disable-line no-restricted-imports -- deprecated usage
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

const msToDays = ms => ms / (24 * 60 * 60 * 1000);

export function getNormalizedStackedTrendDatas(trendDatas) {
  if (trendDatas.length === 0) {
    return [];
  }
  const count = trendDatas[0].length;
  const sums = _.range(count).map(i =>
    trendDatas.reduce((sum, trendData) => sum + trendData[i][1], 0),
  );
  return trendDatas.map(trendData =>
    trendData.map(([x, y], i) => [x, y / sums[i]]),
  );
}

export function getTrendDataPointsFromInsight(insight, xDomain, count = 10) {
  const isTimeseries = moment.isMoment(xDomain[0]);

  let fn;
  if (insight["best-fit"]) {
    fn = x => computeExpression(insight["best-fit"], x);
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
  return _.range(count).map(i => start + delta * i);
}
