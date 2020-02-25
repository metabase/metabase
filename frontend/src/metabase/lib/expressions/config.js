import { t } from "ttag";

// // specifies where different quoting is used:
// export const QUOTES = {
//   "[": "identifier",
//   "'": "literal",
//   '"': "literal",
// };
// // specifies the default quoting style:
// export const LITERAL_QUOTE_DEFAULT = '"';
// export const IDENTIFIER_QUOTE_DEFAULT = "[";
// // always quote identifiers even if they have non-word characters or conflict with reserved words
// export const IDENTIFIER_ALWAYS_QUOTE = true;

export const QUOTES = {
  "'": "literal",
  '"': "identifier",
};
export const LITERAL_QUOTE_DEFAULT = "'";
export const IDENTIFIER_QUOTE_DEFAULT = '"';
export const IDENTIFIER_ALWAYS_QUOTE = false;

// copied relevant parts from https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Operator_Precedence
export const OPERATOR_PRECEDENCE = {
  not: 17,
  "*": 15,
  "/": 15,
  "+": 14,
  "-": 14,
  and: 6,
  or: 5,
};

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
    name: t`lower`,
    type: "expression",
    args: ["expression"],
  },
  upper: {
    name: t`upper`,
    type: "expression",
    args: ["expression"],
  },
  substring: {
    name: t`substring`,
    type: "expression",
    args: ["expression", "expression", "expression"],
  },
  extract: {
    name: t`extract`,
    type: "expression",
    args: ["expression", "expression"],
  },
  concat: {
    name: t`concat`,
    type: "expression",
    args: ["expression"],
  },
  coalesce: {
    name: t`coalesce`,
    type: "expression",
    args: ["expression"],
  },
  replace: {
    name: t`replace`,
    type: "expression",
    args: ["expression", "expression"],
  },
  trim: {
    name: t`trim`,
    type: "expression",
    args: ["expression"],
  },
  rtrim: {
    name: t`rtrim`,
    type: "expression",
    args: ["expression"],
  },
  ltrim: {
    name: t`ltrim`,
    type: "expression",
    args: ["expression"],
  },
  case: {
    name: t`case`,
    type: "expression",
  },
  // filters functions
  contains: {
    name: t`contains`,
    type: "boolean",
    args: ["expression", "expression"],
  },
  "starts-with": {
    name: t`startsWith`,
    type: "boolean",
    args: ["expression", "expression"],
  },
  "ends-with": {
    name: t`endsWith`,
    type: "boolean",
    args: ["expression", "expression"],
  },
  between: {
    name: t`between`,
    type: "boolean",
    args: ["expression", "expression", "expression"],
  },
  "time-interval": {
    name: t`interval`,
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
