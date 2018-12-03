import _ from "underscore";

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

export function isReservedWord(word) {
  return !!getAggregationFromName(word);
}

export function formatAggregationName(aggregationOption) {
  return VALID_AGGREGATIONS.get(aggregationOption.short);
}

function formatIdentifier(name) {
  return /^\w+$/.test(name) && !isReservedWord(name)
    ? name
    : JSON.stringify(name);
}

export function formatMetricName(metric) {
  return formatIdentifier(metric.name);
}

export function formatFieldName(field) {
  return formatIdentifier(field.display_name);
}

export function formatExpressionName(name) {
  return formatIdentifier(name);
}

// move to query lib

export function isExpression(expr) {
  return (
    isMath(expr) ||
    isAggregation(expr) ||
    isField(expr) ||
    isMetric(expr) ||
    isExpressionReference(expr)
  );
}

export function isField(expr) {
  return (
    Array.isArray(expr) &&
    expr.length === 2 &&
    expr[0] === "field-id" &&
    typeof expr[1] === "number"
  );
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

export function isExpressionReference(expr) {
  return (
    Array.isArray(expr) &&
    expr.length === 2 &&
    expr[0] === "expression" &&
    typeof expr[1] === "string"
  );
}

export function isValidArg(arg) {
  return isExpression(arg) || isField(arg) || typeof arg === "number";
}
