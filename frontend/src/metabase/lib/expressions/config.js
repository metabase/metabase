import { t } from "ttag";

export const MBQL_CLAUSES = {
  // aggregation functions
  count: {
    name: t`Count`,
    type: "aggregation",
    args: [],
  },
  "cum-count": {
    name: t`CumulativeCount`,
    type: "aggregation",
    args: [],
  },
  sum: {
    name: t`Sum`,
    type: "aggregation",
    args: ["expression"],
  },
  "cum-sum": {
    name: t`CumulativeSum`,
    type: "aggregation",
    args: ["expression"],
  },
  distinct: {
    name: t`Distinct`,
    type: "aggregation",
    args: ["expression"],
  },
  stddev: {
    name: t`StandardDeviation`,
    type: "aggregation",
    args: ["expression"],
  },
  avg: {
    name: t`Average`,
    type: "aggregation",
    args: ["expression"],
  },
  min: {
    name: t`Min`,
    type: "aggregation",
    args: ["expression"],
  },
  max: {
    name: t`Max`,
    type: "aggregation",
    args: ["expression"],
  },
  share: {
    name: t`Share`,
    type: "aggregation",
    args: ["boolean"],
  },
  "count-where": {
    name: t`CountWhere`,
    type: "aggregation",
    args: ["boolean"],
  },
  "sum-where": {
    name: t`SumWhere`,
    type: "aggregation",
    args: ["expression", "boolean"],
  },
  // expression functions
  lower: {
    name: t`Lower`,
    type: "expression",
    args: ["expression"],
  },
  upper: {
    name: t`Upper`,
    type: "expression",
    args: ["expression"],
  },
  substring: {
    name: t`Substring`,
    type: "expression",
    args: ["expression", "expression", "expression"],
  },
  extract: {
    name: t`Extract`,
    type: "expression",
    args: ["expression", "expression"],
  },
  concat: {
    name: t`Concat`,
    type: "expression",
    args: ["expression"],
  },
  coalesce: {
    name: t`Coalesce`,
    type: "expression",
    args: ["expression"],
  },
  replace: {
    name: t`Replace`,
    type: "expression",
    args: ["expression", "expression"],
  },
  trim: {
    name: t`Trim`,
    type: "expression",
    args: ["expression"],
  },
  rtrim: {
    name: t`RightTrim`,
    type: "expression",
    args: ["expression"],
  },
  ltrim: {
    name: t`LeftTrim`,
    type: "expression",
    args: ["expression"],
  },
  case: {
    name: t`Case`,
    type: "expression",
  },
  // filters functions
  contains: {
    name: t`Contains`,
    type: "boolean",
    args: ["expression", "expression"],
  },
  "starts-with": {
    name: t`StartsWith`,
    type: "boolean",
    args: ["expression", "expression"],
  },
  "ends-with": {
    name: t`EndsWith`,
    type: "boolean",
    args: ["expression", "expression"],
  },
  between: {
    name: t`Between`,
    type: "boolean",
    args: ["expression", "expression", "expression"],
  },
  "time-interval": {
    name: t`Interval`,
    type: "boolean",
    args: ["expression", "expression", "expression"],
  },
  // filter operators
  and: { name: t`AND`, type: "boolean", args: ["boolean", "boolean"] },
  or: { name: t`OR`, type: "boolean", args: ["boolean", "boolean"] },
  not: { name: t`NOT`, type: "boolean", args: ["boolean"] },
  // expression operators
  "*": { name: "*", type: "expression", args: ["expression", "expression"] },
  "/": { name: "/", type: "expression", args: ["expression", "expression"] },
  "-": { name: "-", type: "expression", args: ["expression", "expression"] },
  "+": { name: "+", type: "expression", args: ["expression", "expression"] },
};

// Reserved token names
const MBQL_TO_EXPRESSION_NAME = new Map(
  Object.entries(MBQL_CLAUSES).map(([mbql, { name }]) => [mbql, name]),
);
const EXPRESSION_TO_MBQL_NAME = new Map(
  Object.entries(MBQL_CLAUSES).map(([mbql, { name }]) => [
    // case-insensitive
    name.toLowerCase(),
    mbql,
  ]),
);
export function getExpressionName(mbqlName) {
  return MBQL_TO_EXPRESSION_NAME.get(mbqlName);
}
export function getMBQLName(expressionName) {
  // case-insensitive
  return EXPRESSION_TO_MBQL_NAME.get(expressionName.toLowerCase());
}

export const EXPRESSION_FUNCTIONS = new Set([
  "lower", // concrete-field
  "upper", // concrete-field
  "substring", // concrete-field start length
  "extract", // concrete-field regex
  "concat", // & expression
  "coalesce", // & expression
  "replace", // concrete-field from to
  "trim", // concrete-field
  "rtrim", // concrete-field
  "ltrim", // concrete-field
]);

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
  "avg",
  "min",
  "max",
  "share",
]);

export const FILTER_FUNCTIONS = new Set([
  "contains",
  "ends-with",
  "starts-with",
  "between",
  "time-interval",
]);

export const EXPRESSION_OPERATORS = new Set(["+", "-", "*", "/"]);
export const FILTER_OPERATORS = new Set(["!=", "<=", ">=", "<", ">", "="]);

export const BOOLEAN_UNARY_OPERATORS = new Set(["not"]);
export const BOOLEAN_BINARY_OPERATORS = new Set(["and", "or"]);

export const FUNCTIONS = new Set([
  ...EXPRESSION_FUNCTIONS,
  ...AGGREGATION_FUNCTIONS,
  ...FILTER_FUNCTIONS,
]);

export const OPERATORS = new Set([
  ...EXPRESSION_OPERATORS,
  ...FILTER_OPERATORS,
  ...BOOLEAN_UNARY_OPERATORS,
  ...BOOLEAN_BINARY_OPERATORS,
]);
