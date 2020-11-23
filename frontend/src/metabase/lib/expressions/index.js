export * from "./config";

import Dimension from "metabase-lib/lib/Dimension";
import { FK_SYMBOL } from "metabase/lib/formatting";
import {
  OPERATORS,
  FUNCTIONS,
  EDITOR_QUOTES,
  EDITOR_FK_SYMBOLS,
  getMBQLName,
} from "./config";

// IDENTIFIERS

// can be double-quoted, but are not by default unless they have non-word characters or are reserved
export function formatIdentifier(name, { quotes = EDITOR_QUOTES } = {}) {
  if (
    !quotes.identifierAlwaysQuoted &&
    /^\w+$/.test(name) &&
    !isReservedWord(name)
  ) {
    return name;
  }
  return quoteString(name, quotes.identifierQuoteDefault);
}

export function parseIdentifierString(identifierString) {
  return unquoteString(identifierString);
}

export function isReservedWord(word) {
  return !!getMBQLName(word);
}

// METRICS

export function parseMetric(metricName, { query }) {
  return query
    .table()
    .metrics.find(
      metric => metric.name.toLowerCase() === metricName.toLowerCase(),
    );
}

export function formatMetricName(metric, options) {
  return formatIdentifier(metric.name, options);
}

// SEGMENTS

export function parseSegment(segmentName, { query }) {
  return query
    .table()
    .segments.find(
      segment => segment.name.toLowerCase() === segmentName.toLowerCase(),
    );
}

export function formatSegmentName(segment, options) {
  return formatIdentifier(segment.name, options);
}

// DIMENSIONS

export function parseDimension(name, { query }) {
  // FIXME: this is pretty inefficient, create a lookup table?
  return query
    .dimensionOptions()
    .all()
    .find(d =>
      EDITOR_FK_SYMBOLS.symbols.some(
        separator => getDimensionName(d, separator) === name,
      ),
    );
}

export function formatDimensionName(dimension, options) {
  return formatIdentifier(getDimensionName(dimension), options);
}

export function getDimensionName(
  dimension,
  separator = EDITOR_FK_SYMBOLS.default,
) {
  return dimension.render().replace(` ${FK_SYMBOL} `, separator);
}

// STRING LITERALS

export function formatStringLiteral(
  mbqlString,
  { quotes = EDITOR_QUOTES } = {},
) {
  return quoteString(mbqlString, quotes.literalQuoteDefault);
}
export function parseStringLiteral(expressionString) {
  return unquoteString(expressionString);
}

function quoteString(string, character) {
  if (character === '"') {
    return JSON.stringify(string);
  } else if (character === "'") {
    return swapQuotes(JSON.stringify(swapQuotes(string)));
  } else if (character === "[") {
    // TODO: escape brackets
    if (string.match(/\[|\]/)) {
      throw new Error("String currently can't contain brackets: " + string);
    }
    return `[${string}]`;
  } else if (character === "") {
    // unquoted
    return string;
  } else {
    throw new Error("Unknown quoting: " + character);
  }
}
function unquoteString(string) {
  const character = string.charAt(0);
  if (character === '"') {
    return JSON.parse(string);
  } else if (character === "'") {
    return swapQuotes(JSON.parse(swapQuotes(string)));
  } else if (character === "[") {
    // TODO: unescape brackets
    return string.slice(1, -1);
  } else {
    throw new Error("Unknown quoting: " + string);
  }
}

// HACK: use JSON.stringify to escape single quotes by swapping single and doulble quotes before/after
function swapQuotes(str) {
  return str.replace(/['"]/g, q => (q === "'" ? '"' : "'"));
}

// move to query lib

export function isExpression(expr) {
  return (
    isLiteral(expr) ||
    isOperator(expr) ||
    isFunction(expr) ||
    isDimension(expr) ||
    isMetric(expr) ||
    isSegment(expr) ||
    isCase(expr)
  );
}

export function isLiteral(expr) {
  return isStringLiteral(expr) || isNumberLiteral(expr);
}

export function isStringLiteral(expr) {
  return typeof expr === "string";
}

export function isNumberLiteral(expr) {
  return typeof expr === "number";
}

export function isOperator(expr) {
  return (
    Array.isArray(expr) &&
    OPERATORS.has(expr[0]) &&
    expr
      .slice(1, hasOptions(expr) ? -1 : 0) // skip options object at the end
      .every(isExpression)
  );
}

function isPlainObject(obj) {
  return obj && Object.getPrototypeOf(obj) === Object.prototype;
}

export function hasOptions(expr) {
  return isPlainObject(expr[expr.length - 1]);
}

export function isFunction(expr) {
  return (
    Array.isArray(expr) &&
    FUNCTIONS.has(expr[0]) &&
    expr
      .slice(1, hasOptions(expr) ? -1 : 0) // skip options object at the end
      .every(isExpression)
  );
}

export function isDimension(expr) {
  return !!Dimension.parseMBQL(expr);
}

export function isMetric(expr) {
  return (
    Array.isArray(expr) &&
    expr[0] === "metric" &&
    expr.length === 2 &&
    typeof expr[1] === "number"
  );
}

export function isSegment(expr) {
  return (
    Array.isArray(expr) &&
    expr[0] === "segment" &&
    expr.length === 2 &&
    typeof expr[1] === "number"
  );
}

export function isCase(expr) {
  return Array.isArray(expr) && expr[0] === "case"; // && _.all(expr.slice(1), isValidArg)
}
