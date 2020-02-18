import _ from "underscore";

import Dimension from "metabase-lib/lib/Dimension";

import {
  OPERATORS,
  AGGREGATIONS,
  FUNCTIONS,
  FILTERS,
  FILTER_OPERATORS,
  getMBQLName,
  getExpressionName,
} from "./config";
export {
  OPERATORS,
  AGGREGATIONS,
  FUNCTIONS,
  FILTERS,
  FILTER_OPERATORS,
} from "./config";

// aggregations

export function parseAggregationName(expressionName) {
  return getMBQLName(expressionName);
}

export function formatAggregationName(mbqlName) {
  return getExpressionName(mbqlName);
}

// functions

export function parseFunctionName(expressionName) {
  return getMBQLName(expressionName);
}

export function formatFunctionName(mbqlName) {
  return getExpressionName(mbqlName);
}

// IDENTIFIERS

// can be double-quoted, but are not by default unless they have non-word characters or are reserved
export function formatIdentifier(name) {
  return /^\w+$/.test(name) && !isReservedWord(name)
    ? name
    : JSON.stringify(name);
}

export function parseIdentifierString(identifierString) {
  return JSON.parse(identifierString);
}

export function isReservedWord(word) {
  return !!getMBQLName(word);
}

// METRICS

export function parseMetric(metricName) {
  return this._options.query
    .table()
    .metrics.find(
      metric => metric.name.toLowerCase() === metricName.toLowerCase(),
    );
}

export function formatMetricName(metric) {
  return formatIdentifier(metric.name);
}

// DIMENSIONS

export function parseDimension(name, query) {
  // FIXME: this is pretty inefficient, create a lookup table?
  return query
    .dimensionOptions()
    .all()
    .find(d => getDimensionName(d) === name);
}

export function formatDimensionName(dimension) {
  return formatIdentifier(getDimensionName(dimension));
}

export function getDimensionName(dimension) {
  return dimension.render();
}

// STRING LITERALS

export function formatStringLiteral(mbqlString) {
  // HACK: use JSON.stringify to escape single quotes by swapping single and doulble quotes before/after
  return swapQuotes(JSON.stringify(swapQuotes(mbqlString)));
}
export function parseStringLiteral(expressionString) {
  // HACK: use JSON.parse to unescape single quotes by swapping single and doulble quotes before/after
  return swapQuotes(JSON.parse(swapQuotes(expressionString)));
}
function swapQuotes(str) {
  return str.replace(/['"]/g, q => (q === "'" ? '"' : "'"));
}

// move to query lib

export function isExpression(expr) {
  return (
    isMath(expr) ||
    isAggregation(expr) ||
    isFieldReference(expr) ||
    isMetric(expr) ||
    isFilter(expr) ||
    isFunction(expr)
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
    OPERATORS.has(expr[0]) &&
    _.all(expr.slice(1), isValidArg)
  );
}

export function isAggregation(expr) {
  return (
    Array.isArray(expr) &&
    AGGREGATIONS.has(expr[0]) &&
    _.all(expr.slice(1), isValidArg)
  );
}

export function isFilter(expr) {
  return (
    Array.isArray(expr) &&
    (FILTERS.has(expr[0]) || FILTER_OPERATORS.has(expr[0]))
  ); // && _.all(expr.slice(1), isValidArg)
}

export function isFunction(expr) {
  return Array.isArray(expr) && FUNCTIONS.has(expr[0]); // && _.all(expr.slice(1), isValidArg)
}

// UTILS

export function isValidArg(arg) {
  return isExpression(arg) || isFieldReference(arg) || typeof arg === "number";
}
