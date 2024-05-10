import { t } from "ttag";

import type { MBQLClauseMap } from "./types";

export const DISPLAY_QUOTES = {
  identifierQuoteDefault: "",
  literalQuoteDefault: "",
};

export const EDITOR_QUOTES = {
  // specifies where different quoting is used:
  characters: {
    "[": "identifier",
    "'": "literal",
    '"': "literal",
  },
  // specifies the default quoting style:
  literalQuoteDefault: '"',
  identifierQuoteDefault: "[",
  // always quote identifiers even if they have non-word characters or conflict with reserved words
  identifierAlwaysQuoted: true,
};

export const EDITOR_FK_SYMBOLS = {
  // specifies which symbols can be used to delimit foreign/joined fields
  symbols: [".", " → "],
  // specifies the default/canonical symbol
  default: " → ",
};

// copied relevant parts from https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Operator_Precedence
export const OPERATOR_PRECEDENCE: Record<string, number> = {
  not: 17,
  "*": 15,
  "/": 15,
  "+": 14,
  "-": 14,
  and: 6,
  or: 5,
};

export const MBQL_CLAUSES: MBQLClauseMap = {
  // aggregation functions
  count: { displayName: `Count`, type: "aggregation", args: [] },
  "cum-count": {
    displayName: `CumulativeCount`,
    type: "aggregation",
    args: [],
  },
  sum: { displayName: `Sum`, type: "aggregation", args: ["number"] },
  "cum-sum": {
    displayName: `CumulativeSum`,
    type: "aggregation",
    args: ["number"],
  },
  distinct: {
    displayName: `Distinct`,
    type: "aggregation",
    args: ["expression"],
  },
  stddev: {
    displayName: `StandardDeviation`,
    type: "aggregation",
    args: ["number"],
    requiresFeature: "standard-deviation-aggregations",
  },
  avg: { displayName: `Average`, type: "aggregation", args: ["number"] },
  median: {
    displayName: `Median`,
    type: "aggregation",
    args: ["number"],
    requiresFeature: "percentile-aggregations",
  },
  min: { displayName: `Min`, type: "aggregation", args: ["expression"] },
  max: { displayName: `Max`, type: "aggregation", args: ["expression"] },
  share: { displayName: `Share`, type: "aggregation", args: ["boolean"] },
  "count-where": {
    displayName: `CountIf`,
    type: "aggregation",
    args: ["boolean"],
  },
  "sum-where": {
    displayName: `SumIf`,
    type: "aggregation",
    args: ["number", "boolean"],
  },
  var: {
    displayName: `Variance`,
    type: "aggregation",
    args: ["number"],
    requiresFeature: "standard-deviation-aggregations",
  },
  percentile: {
    displayName: `Percentile`,
    type: "aggregation",
    args: ["number", "number"],
    requiresFeature: "percentile-aggregations",
  },
  // string functions
  lower: { displayName: `lower`, type: "string", args: ["string"] },
  upper: { displayName: `upper`, type: "string", args: ["string"] },
  substring: {
    displayName: `substring`,
    type: "string",
    args: ["string", "number", "number"],
    validator: function (_arg: any, start: number, _length: any) {
      if (start <= 0) {
        return t`Expected positive integer but found ${start}`;
      }
    },
  },
  "regex-match-first": {
    displayName: `regexextract`,
    type: "string",
    args: ["string", "string"],
    requiresFeature: "regex",
  },
  concat: {
    displayName: `concat`,
    type: "string",
    args: ["expression"],
    multiple: true,
  },
  replace: {
    displayName: `replace`,
    type: "string",
    args: ["string", "string", "string"],
  },
  length: { displayName: `length`, type: "number", args: ["string"] },
  trim: { displayName: `trim`, type: "string", args: ["string"] },
  rtrim: { displayName: `rtrim`, type: "string", args: ["string"] },
  ltrim: { displayName: `ltrim`, type: "string", args: ["string"] },
  domain: {
    displayName: `domain`,
    type: "string",
    args: ["string"],
    requiresFeature: "regex",
  },
  subdomain: {
    displayName: `subdomain`,
    type: "string",
    args: ["string"],
    requiresFeature: "regex",
  },
  host: {
    displayName: `host`,
    type: "string",
    args: ["string"],
    requiresFeature: "regex",
  },
  "month-name": {
    displayName: `monthName`,
    type: "string",
    args: ["number"],
  },
  "quarter-name": {
    displayName: `quarterName`,
    type: "string",
    args: ["number"],
  },
  "day-name": {
    displayName: `dayName`,
    type: "string",
    args: ["number"],
  },
  // numeric functions
  abs: {
    displayName: `abs`,
    type: "number",
    args: ["number"],
    requiresFeature: "expressions",
  },
  floor: {
    displayName: `floor`,
    type: "number",
    args: ["number"],
    requiresFeature: "expressions",
  },
  ceil: {
    displayName: `ceil`,
    type: "number",
    args: ["number"],
    requiresFeature: "expressions",
  },
  round: {
    displayName: `round`,
    type: "number",
    args: ["number"],
    requiresFeature: "expressions",
  },
  sqrt: {
    displayName: `sqrt`,
    type: "number",
    args: ["number"],
    requiresFeature: "advanced-math-expressions",
  },
  power: {
    displayName: `power`,
    type: "number",
    args: ["number", "number"],
    requiresFeature: "advanced-math-expressions",
  },
  log: {
    displayName: `log`,
    type: "number",
    args: ["number"],
    requiresFeature: "advanced-math-expressions",
  },
  exp: {
    displayName: `exp`,
    type: "number",
    args: ["number"],
    requiresFeature: "advanced-math-expressions",
  },
  // boolean functions
  contains: {
    displayName: `contains`,
    type: "boolean",
    args: ["string", "string"],
    hasOptions: true,
  },
  "does-not-contain": {
    displayName: `doesNotContain`,
    type: "boolean",
    args: ["string", "string"],
    hasOptions: true,
  },
  "starts-with": {
    displayName: `startsWith`,
    type: "boolean",
    args: ["string", "string"],
    hasOptions: true,
  },
  "ends-with": {
    displayName: `endsWith`,
    type: "boolean",
    args: ["string", "string"],
    hasOptions: true,
  },
  between: {
    displayName: `between`,
    type: "boolean",
    args: ["expression", "expression", "expression"],
  },
  interval: {
    displayName: "timeSpan",
    type: "number",
    args: ["number", "string"],
  },
  "time-interval": {
    displayName: `interval`,
    type: "boolean",
    args: ["expression", "number", "string"],
    hasOptions: true,
  },
  "relative-datetime": {
    displayName: "relativeDateTime",
    type: "expression",
    args: ["number", "string"],
  },
  "is-null": {
    displayName: `isnull`,
    type: "boolean",
    args: ["expression"],
  },
  "not-null": {
    displayName: `notnull`,
    type: "boolean",
    args: ["expression"],
  },
  "is-empty": {
    displayName: `isempty`,
    type: "boolean",
    args: ["expression"],
  },
  "not-empty": {
    displayName: `notempty`,
    type: "boolean",
    args: ["expression"],
  },
  // other expression functions
  coalesce: {
    displayName: `coalesce`,
    type: "expression",
    args: ["expression", "expression"],
    multiple: true,
  },
  case: {
    displayName: `case`,
    type: "expression",
    args: ["expression", "expression"], // ideally we'd alternate boolean/expression
    multiple: true,
  },
  offset: {
    displayName: `Offset`,
    type: "any", // ideally we'd dynamically infer it from the first argument
    args: ["any", "number"],
    requiresFeature: "window-functions/offset",
    validator: function (_expr: any, offset: number) {
      if (offset === 0) {
        return t`Row offset cannot be zero`;
      }
    },
    hasOptions: true,
  },
  // boolean operators
  and: { displayName: `AND`, type: "boolean", args: ["boolean", "boolean"] },
  or: { displayName: `OR`, type: "boolean", args: ["boolean", "boolean"] },
  not: { displayName: `NOT`, type: "boolean", args: ["boolean"] },
  // numeric operators
  "*": {
    displayName: "*",
    tokenName: "Multi",
    type: "number",
    args: ["number", "number"],
  },
  "/": {
    displayName: "/",
    tokenName: "Div",
    type: "number",
    args: ["number", "number"],
  },
  "-": {
    displayName: "-",
    tokenName: "Minus",
    type: "number",
    args: ["number", "number"],
  },
  "+": {
    displayName: "+",
    tokenName: "Plus",
    type: "number",
    args: ["number", "number"],
  },
  // comparison operators
  "!=": {
    displayName: "!=",
    tokenName: "NotEqual",
    type: "boolean",
    args: ["expression", "expression"],
  },
  "<=": {
    displayName: "<=",
    tokenName: "LessThanEqual",
    type: "boolean",
    args: ["expression", "expression"],
  },
  ">=": {
    displayName: ">=",
    tokenName: "GreaterThanEqual",
    type: "boolean",
    args: ["expression", "expression"],
  },
  "<": {
    displayName: "<",
    tokenName: "LessThan",
    type: "boolean",
    args: ["expression", "expression"],
  },
  ">": {
    displayName: ">",
    tokenName: "GreaterThan",
    type: "boolean",
    args: ["expression", "expression"],
  },
  "=": {
    displayName: "=",
    tokenName: "Equal",
    type: "boolean",
    args: ["expression", "expression"],
  },
  "get-year": {
    displayName: `year`,
    type: "number",
    args: ["datetime"],
  },
  "get-quarter": {
    displayName: `quarter`,
    type: "number",
    args: ["datetime"],
  },
  "get-month": {
    displayName: `month`,
    type: "number",
    args: ["datetime"],
  },
  "get-week": {
    displayName: `week`,
    type: "number",
    args: ["datetime"],
    hasOptions: true, // optional mode parameter
  },
  "get-day": {
    displayName: `day`,
    type: "number",
    args: ["datetime"],
  },
  "get-day-of-week": {
    displayName: `weekday`,
    type: "number",
    args: ["datetime"],
  },
  "get-hour": {
    displayName: `hour`,
    type: "number",
    args: ["datetime"],
  },
  "get-minute": {
    displayName: `minute`,
    type: "number",
    args: ["datetime"],
  },
  "get-second": {
    displayName: `second`,
    type: "number",
    args: ["datetime"],
  },
  "datetime-diff": {
    displayName: `datetimeDiff`,
    type: "number",
    args: ["datetime", "datetime", "string"],
    requiresFeature: "datetime-diff",
  },
  "datetime-add": {
    displayName: `datetimeAdd`,
    type: "datetime",
    args: ["datetime", "number", "string"],
  },
  "datetime-subtract": {
    displayName: `datetimeSubtract`,
    type: "datetime",
    args: ["datetime", "number", "string"],
  },
  now: {
    displayName: `now`,
    type: "datetime",
    args: [],
  },
  "convert-timezone": {
    displayName: `convertTimezone`,
    type: "datetime",
    args: ["datetime", "string"],
    hasOptions: true,
    requiresFeature: "convert-timezone",
  },
};

for (const [name, clause] of Object.entries(MBQL_CLAUSES)) {
  if (clause.name !== undefined && clause.name !== name) {
    console.warn("Mismatched name for MBQL_CLAUSES " + name);
  }
  clause.name = name;
}

// Reserved token names
const MBQL_TO_EXPRESSION_NAME = new Map(
  Object.entries(MBQL_CLAUSES).map(([mbql, { displayName }]) => [
    mbql,
    displayName,
  ]),
);
const EXPRESSION_TO_MBQL_NAME = new Map(
  Object.entries(MBQL_CLAUSES).map(([mbql, { displayName }]) => [
    // case-insensitive
    displayName.toLowerCase(),
    mbql,
  ]),
);
export function getExpressionName(mbqlName: string) {
  return MBQL_TO_EXPRESSION_NAME.get(mbqlName);
}
export function getMBQLName(expressionName: string) {
  // case-insensitive
  return EXPRESSION_TO_MBQL_NAME.get(expressionName.toLowerCase());
}

export const AGGREGATION_FUNCTIONS = new Set([
  // count-where/sum-where must come before count/sum
  "count-where",
  "sum-where",
  "count",
  "cum-count",
  "sum",
  "cum-sum",
  "distinct",
  "stddev",
  "offset",
  "avg",
  "median",
  "min",
  "max",
  "share",
  "var",
  "percentile",
]);

export const EXPRESSION_FUNCTIONS = new Set([
  // string
  "lower",
  "upper",
  "substring",
  "regex-match-first",
  "concat",
  "replace",
  "trim",
  "rtrim",
  "ltrim",
  "length",
  "domain",
  "subdomain",
  "host",
  "month-name",
  "quarter-name",
  "day-name",
  // number
  "abs",
  "floor",
  "ceil",
  "round",
  "sqrt",
  "power",
  "log",
  "exp",
  "datetime-diff",
  // date/time
  "get-year",
  "get-quarter",
  "get-month",
  "get-week",
  "get-day",
  "get-day-of-week",
  "get-hour",
  "get-minute",
  "get-second",
  "datetime-add",
  "datetime-subtract",
  "now",
  "convert-timezone",
  // boolean
  "contains",
  "ends-with",
  "starts-with",
  "between",
  "time-interval",
  "relative-datetime",
  "interval",
  "is-null",
  "not-null",
  "is-empty",
  "not-empty",
  "does-not-contain",
  // other
  "coalesce",
]);

const EXPRESSION_OPERATORS = new Set(["+", "-", "*", "/"]);

// operators in which order of operands doesn't matter
export const EXPRESSION_OPERATOR_WITHOUT_ORDER_PRIORITY = new Set(["+", "*"]);

export const FILTER_OPERATORS = new Set(["!=", "<=", ">=", "<", ">", "="]);

const BOOLEAN_UNARY_OPERATORS = new Set(["not"]);
const LOGICAL_AND_OPERATOR = new Set(["and"]);
const LOGICAL_OR_OPERATOR = new Set(["or"]);

export const FUNCTIONS = new Set([
  ...EXPRESSION_FUNCTIONS,
  ...AGGREGATION_FUNCTIONS,
]);

export const OPERATORS = new Set([
  ...EXPRESSION_OPERATORS,
  ...FILTER_OPERATORS,
  ...BOOLEAN_UNARY_OPERATORS,
  ...LOGICAL_AND_OPERATOR,
  ...LOGICAL_OR_OPERATOR,
]);

// "standard" filters, can be edited using UI
export const STANDARD_FILTERS = new Set([
  "!=",
  "<=",
  ">=",
  "<",
  ">",
  "=",
  "contains",
  "does-not-contain",
  "ends-with",
  "starts-with",
  "between",
  "time-interval",
  "is-null",
  "not-null",
  "is-empty",
  "not-empty",
  "inside",
]);

// "standard" aggregations, can be edited using UI
export const STANDARD_AGGREGATIONS = new Set([
  "count",
  "cum-count",
  "sum",
  "cum-sum",
  "distinct",
  "stddev",
  "avg",
  "min",
  "max",
  "median",
]);

export const POPULAR_FUNCTIONS = [
  "case",
  "concat",
  "contains",
  "between",
  "coalesce",
];

export const POPULAR_FILTERS = [
  "contains",
  "case",
  "between",
  "interval",
  "concat",
  "round",
];

export const POPULAR_AGGREGATIONS = [
  "count",
  "distinct",
  "count-where",
  "sum",
  "avg",
];
