import { t } from "ttag";

import { OPERATOR } from "./tokenizer";
import type { MBQLClauseFunctionConfig } from "./types";

export const EDITOR_QUOTES = {
  // specifies where different quoting is used:
  characters: {
    "[": "identifier",
    "'": "literal",
    '"': "literal",
  },
  // specifies the default quoting style:
  literalQuoteDefault: '"' as const,
  identifierQuoteDefault: "[" as const,
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

function defineClauses<
  const T extends Record<
    string,
    Omit<MBQLClauseFunctionConfig, "name"> & { name?: never }
  >,
>(clauses: T): Record<keyof T, MBQLClauseFunctionConfig> {
  const result = {} as Record<keyof T, MBQLClauseFunctionConfig>;
  for (const name in clauses) {
    result[name] = { ...clauses[name], name };
  }
  return result;
}

// `type` and `args` types have no effect. Type checking is done by MBQL lib.
export const MBQL_CLAUSES = defineClauses({
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
  "distinct-where": {
    displayName: `DistinctIf`,
    type: "aggregation",
    args: ["number", "boolean"],
    requiresFeature: "distinct-where",
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
  // cast functions
  text: {
    displayName: "text",
    type: "string",
    args: ["expression"],
    requiresFeature: "expressions/text",
  },
  integer: {
    displayName: "integer",
    type: "number",
    args: ["expression"],
    requiresFeature: "expressions/integer",
  },
  date: {
    displayName: "date",
    type: "datetime",
    args: ["expression"],
    requiresFeature: "expressions/date",
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
  "split-part": {
    displayName: "splitPart",
    type: "string",
    args: ["string", "string", "number"],
    validator: function (_arg: any, _delimeter: string, position: number) {
      if (position < 1) {
        return t`Expected positive integer but found ${position}`;
      }
    },
    requiresFeature: "split-part",
  },
  "regex-match-first": {
    displayName: `regexextract`,
    type: "string",
    args: ["string", "string"],
    requiresFeature: "regex",
  },
  path: {
    displayName: `path`,
    type: "string",
    args: ["string"],
    requiresFeature: "regex",
  },
  concat: {
    displayName: `concat`,
    type: "string",
    args: ["expression", "expression"],
    multiple: true,
  },
  replace: {
    displayName: `replace`,
    type: "string",
    args: ["string", "string", "string"],
  },
  length: { displayName: `length`, type: "number", args: ["string"] },
  trim: { displayName: `trim`, type: "string", args: ["string"] },
  rtrim: { displayName: `rTrim`, type: "string", args: ["string"] },
  ltrim: { displayName: `lTrim`, type: "string", args: ["string"] },
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
    multiple: true,
    hasOptions: true,
  },
  "does-not-contain": {
    displayName: `doesNotContain`,
    type: "boolean",
    args: ["string", "string"],
    multiple: true,
    hasOptions: true,
  },
  "starts-with": {
    displayName: `startsWith`,
    type: "boolean",
    args: ["string", "string"],
    multiple: true,
    hasOptions: true,
  },
  "ends-with": {
    displayName: `endsWith`,
    type: "boolean",
    args: ["string", "string"],
    multiple: true,
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
  "relative-time-interval": {
    displayName: "intervalStartingFrom",
    type: "boolean",
    args: ["expression", "number", "string", "number", "string"],
  },
  "relative-datetime": {
    displayName: "relativeDateTime",
    type: "expression",
    args: ["number", "string"],
  },
  "is-null": {
    displayName: `isNull`,
    type: "boolean",
    args: ["expression"],
  },
  "not-null": {
    displayName: `notNull`,
    type: "boolean",
    args: ["expression"],
  },
  "is-empty": {
    displayName: `isEmpty`,
    type: "boolean",
    args: ["expression"],
  },
  "not-empty": {
    displayName: `notEmpty`,
    type: "boolean",
    args: ["expression"],
  },
  // other expression functions
  coalesce: {
    displayName: `coalesce`,
    type: "expression",
    args: ["expression", "expression"],
    argType(_index, _args, type) {
      return type;
    },
    multiple: true,
  },
  case: {
    displayName: `case`,
    type: "expression",
    multiple: true,
    args: ["expression", "expression"], // ideally we'd alternate boolean/expression
    argType(index, args, type) {
      const len = args.length;
      if (len % 2 === 1 && index === len - 1) {
        return type;
      }
      if (index % 2 === 1) {
        return type;
      }
      return "boolean";
    },
  },
  if: {
    displayName: `if`,
    type: "expression",
    multiple: true,
    args: ["expression", "expression"],
    argType(index, args, type) {
      const len = args.length;
      if (len % 2 === 1 && index === len - 1) {
        return type;
      }
      if (index % 2 === 1) {
        return type;
      }
      return "boolean";
    },
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
  and: {
    displayName: `AND`,
    type: "boolean",
    multiple: true,
    args: ["boolean", "boolean"],
    argType() {
      return "boolean";
    },
  },
  or: {
    displayName: `OR`,
    type: "boolean",
    multiple: true,
    args: ["boolean", "boolean"],
    argType() {
      return "boolean";
    },
  },
  not: {
    displayName: `NOT`,
    type: "boolean",
    args: ["boolean"],
  },
  // numeric operators
  "*": {
    displayName: "*",
    type: "number",
    args: ["number", "number"],
    multiple: true,
    argType(_index, _args, type) {
      if (type === "aggregation") {
        return "aggregation";
      }
      return "number";
    },
  },
  "/": {
    displayName: "/",
    type: "number",
    args: ["number", "number"],
    multiple: true,
    argType(_index, _args, type) {
      if (type === "aggregation") {
        return "aggregation";
      }
      return "number";
    },
  },
  "-": {
    displayName: "-",
    type: "number",
    args: ["number", "number"],
    multiple: true,
    argType(_index, _args, type) {
      if (type === "aggregation") {
        return "aggregation";
      }
      return "number";
    },
  },
  "+": {
    displayName: "+",
    type: "number",
    args: ["number", "number"],
    multiple: true,
    argType(_index, _args, type) {
      if (type === "aggregation") {
        return "aggregation";
      }
      return "number";
    },
  },
  // comparison operators
  "=": {
    displayName: "=",
    type: "boolean",
    args: ["expression", "expression"],
  },
  "!=": {
    displayName: "!=",
    type: "boolean",
    args: ["expression", "expression"],
  },
  // `in` and `not-in` are aliases for `=` and `!=`
  in: {
    displayName: "in",
    type: "boolean",
    args: ["expression", "expression"],
    multiple: true,
  },
  "not-in": {
    displayName: "notIn",
    type: "boolean",
    args: ["expression", "expression"],
    multiple: true,
  },
  "<=": {
    displayName: "<=",
    type: "boolean",
    args: ["expression", "expression"],
  },
  ">=": {
    displayName: ">=",
    type: "boolean",
    args: ["expression", "expression"],
  },
  "<": {
    displayName: "<",
    type: "boolean",
    args: ["expression", "expression"],
  },
  ">": {
    displayName: ">",
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
    hasOptions: true, // optional mode parameter
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
});

export type DefinedClauseName = keyof typeof MBQL_CLAUSES;

export function isDefinedClause(name: string): name is DefinedClauseName {
  return name in MBQL_CLAUSES;
}

export function getClauseDefinition(
  name: DefinedClauseName,
): MBQLClauseFunctionConfig;
export function getClauseDefinition(
  name: string,
): MBQLClauseFunctionConfig | undefined;
export function getClauseDefinition(
  name: string,
): MBQLClauseFunctionConfig | undefined {
  if (isDefinedClause(name)) {
    return MBQL_CLAUSES[name];
  }
  return undefined;
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
    mbql as DefinedClauseName,
  ]),
);
export function getExpressionName(mbqlName: string) {
  return MBQL_TO_EXPRESSION_NAME.get(mbqlName);
}
export function getMBQLName(
  expressionName: string,
): DefinedClauseName | undefined {
  // case-insensitive
  return EXPRESSION_TO_MBQL_NAME.get(expressionName.trim().toLowerCase());
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
  "distinct-where",
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
  // cast
  "text",
  "integer",
  "date",
  // string
  "lower",
  "upper",
  "substring",
  "split-part",
  "regex-match-first",
  "path",
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
  "in",
  "not-in",
  "contains",
  "ends-with",
  "starts-with",
  "between",
  "time-interval",
  "relative-time-interval",
  "relative-datetime",
  "interval",
  "is-null",
  "not-null",
  "is-empty",
  "not-empty",
  "does-not-contain",
  // other
  "if",
  "case",
  "coalesce",
]);

export const NUMBER_OPERATORS = new Set([
  OPERATOR.Plus,
  OPERATOR.Minus,
  OPERATOR.Star,
  OPERATOR.Slash,
]);

// operators in which order of operands doesn't matter
export const EXPRESSION_OPERATOR_WITHOUT_ORDER_PRIORITY = new Set(["+", "*"]);

export const COMPARISON_OPERATORS = new Set([
  OPERATOR.Equal,
  OPERATOR.NotEqual,
  OPERATOR.GreaterThan,
  OPERATOR.LessThan,
  OPERATOR.GreaterThanEqual,
  OPERATOR.LessThanEqual,
]);

export const LOGICAL_OPERATORS = new Set([
  OPERATOR.Not,
  OPERATOR.And,
  OPERATOR.Or,
]);

export const FUNCTIONS = new Set([
  ...EXPRESSION_FUNCTIONS,
  ...AGGREGATION_FUNCTIONS,
]);

export const OPERATORS = new Set([
  ...NUMBER_OPERATORS,
  ...COMPARISON_OPERATORS,
  ...LOGICAL_OPERATORS,
]);

export const FIELD_MARKERS = new Set([
  "dimension",
  "field",
  "segment",
  "metric",
]);
