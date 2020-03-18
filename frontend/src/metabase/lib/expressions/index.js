import _ from "underscore";

import Dimension from "metabase-lib/lib/Dimension";

import { VALID_OPERATORS, VALID_AGGREGATIONS } from "./config";
export { VALID_OPERATORS, VALID_AGGREGATIONS } from "./config";

const AGG_NAMES_MAP = new Map(
  Array.from(VALID_AGGREGATIONS).map(([short, displayName]) =>
    // case-insensitive
    [displayName.toLowerCase(), short],
  ),
);

export function getAggregationFromName(name) {
  // case-insensitive
  return AGG_NAMES_MAP.get(name.toLowerCase());
}

export function getDimensionFromName(name, query) {
  return query
    .dimensionOptions()
    .all()
    .find(d => getDimensionName(d) === name);
}

export function isReservedWord(word) {
  return !!getAggregationFromName(word);
}

export function formatAggregationName(aggregationOperator) {
  return VALID_AGGREGATIONS.get(aggregationOperator.short);
}

export function formatIdentifier(name) {
  return /^\w+$/.test(name) && !isReservedWord(name)
    ? name
    : JSON.stringify(name);
}

export function formatMetricName(metric) {
  return formatIdentifier(metric.name);
}

export function formatDimensionName(dimension) {
  return formatIdentifier(getDimensionName(dimension));
}

export function getDimensionName(dimension) {
  return dimension.render();
}

// move to query lib

export function isExpression(expr) {
  return (
    isMath(expr) ||
    isAggregation(expr) ||
    isFieldReference(expr) ||
    isMetric(expr)
  );
}

export function isFieldReference(expr) {
  return !!Dimension.parseMBQL(expr);
}

export function isMetric(expr) {
  // case sensitive, unlike most mbql
  return (
    Array.isArray(expr) &&
    expr.length === 2 &&
    expr[0] === "metric" &&
    typeof expr[1] === "number"
  );
}

export function isMath(expr) {
  return (
    Array.isArray(expr) &&
    VALID_OPERATORS.has(expr[0]) &&
    _.all(expr.slice(1), isValidArg)
  );
}

export function isAggregation(expr) {
  return (
    Array.isArray(expr) &&
    VALID_AGGREGATIONS.has(expr[0]) &&
    _.all(expr.slice(1), isValidArg)
  );
}

export function isValidArg(arg) {
  return isExpression(arg) || isFieldReference(arg) || typeof arg === "number";
}
