import { t } from "ttag";

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

// export const EDITOR_QUOTES = {
//   characters: {
//     "'": "literal",
//     '"': "identifier",
//   },
//   literalQuoteDefault: "'",
//   identifierQuoteDefault: '"',
//   identifierAlwaysQuoted: false,
// };

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

export const EXPRESSION_TYPES = [
  "expression",
  "aggregation",
  "boolean",
  "string",
  "number",
];

export const EXPRESSION_SUBTYPES = {
  // can't currently add "boolean" as a subtype of expression due to conflict between segments and fields
  expression: new Set(["string", "number"]),
};

export const isExpressionType = (typeA, typeB) =>
  typeA === typeB ||
  (EXPRESSION_SUBTYPES[typeB] && EXPRESSION_SUBTYPES[typeB].has(typeA)) ||
  false;

export function getFunctionArgType(clause, index) {
  return clause.multiple ? clause.args[0] : clause.args[index];
}

export const MBQL_CLAUSES = {
  // aggregation functions
  count: {
    displayName: t`Count`,
    type: "aggregation",
    args: [],
  },
  "cum-count": {
    displayName: t`CumulativeCount`,
    type: "aggregation",
    args: [],
  },
  sum: {
    displayName: t`Sum`,
    type: "aggregation",
    args: ["number"],
  },
  "cum-sum": {
    displayName: t`CumulativeSum`,
    type: "aggregation",
    args: ["number"],
  },
  distinct: {
    displayName: t`Distinct`,
    type: "aggregation",
    args: ["number"],
  },
  stddev: {
    displayName: t`StandardDeviation`,
    type: "aggregation",
    args: ["number"],
  },
  avg: {
    displayName: t`Average`,
    type: "aggregation",
    args: ["number"],
  },
  min: {
    displayName: t`Min`,
    type: "aggregation",
    args: ["number"],
  },
  max: {
    displayName: t`Max`,
    type: "aggregation",
    args: ["number"],
  },
  share: {
    displayName: t`Share`,
    type: "aggregation",
    args: ["boolean"],
  },
  "count-where": {
    displayName: t`CountIf`,
    type: "aggregation",
    args: ["boolean"],
  },
  "sum-where": {
    displayName: t`SumIf`,
    type: "aggregation",
    args: ["number", "boolean"],
  },
  var: {
    displayName: `Variance`,
    type: "aggregation",
    args: ["number"],
  },
  median: {
    displayName: `Median`,
    type: "aggregation",
    args: ["number"],
  },
  percentile: {
    displayName: `Percentile`,
    type: "aggregation",
    args: ["number"],
  },
  // string functions
  lower: {
    displayName: t`lower`,
    type: "string",
    args: ["string"],
  },
  upper: {
    displayName: t`upper`,
    type: "string",
    args: ["string"],
  },
  substring: {
    displayName: t`substring`,
    type: "string",
    args: ["string", "number", "number"],
  },
  "regex-match-first": {
    displayName: t`regexextract`,
    type: "string",
    args: ["string", "string"],
    requiredFeatures: ["regex"],
  },
  concat: {
    displayName: t`concat`,
    type: "string",
    args: ["expression"],
    multiple: true,
  },
  replace: {
    displayName: t`substitute`,
    type: "string",
    args: ["string", "string", "string"],
  },
  length: {
    displayName: `length`,
    type: "string",
    args: ["string"],
  },
  trim: {
    displayName: t`trim`,
    type: "string",
    args: ["string", "string"],
  },
  rtrim: {
    displayName: t`rtrim`,
    type: "string",
    args: ["string"],
  },
  ltrim: {
    displayName: t`ltrim`,
    type: "string",
    args: ["string"],
  },
  // numeric functions
  abs: {
    displayName: `abs`,
    type: "number",
    args: ["number"],
  },
  floor: {
    displayName: `floor`,
    type: "number",
    args: ["number"],
  },
  ceil: {
    displayName: `ceil`,
    type: "number",
    args: ["number"],
  },
  round: {
    displayName: `round`,
    type: "number",
    args: ["number"],
  },
  sqrt: {
    displayName: `sqrt`,
    type: "number",
    args: ["number"],
  },
  power: {
    displayName: `power`,
    type: "number",
    args: ["number", "number"],
  },
  log: {
    displayName: `log`,
    type: "number",
    args: ["number"],
  },
  exp: {
    displayName: `exp`,
    type: "number",
    args: ["number"],
  },
  // boolean functions
  contains: {
    displayName: t`contains`,
    type: "boolean",
    args: ["string", "string"],
  },
  "starts-with": {
    displayName: t`startsWith`,
    type: "boolean",
    args: ["string", "string"],
  },
  "ends-with": {
    displayName: t`endsWith`,
    type: "boolean",
    args: ["string", "string"],
  },
  between: {
    displayName: t`between`,
    type: "boolean",
    args: ["expression", "expression", "expression"],
  },
  "time-interval": {
    displayName: t`interval`,
    type: "boolean",
    args: ["expression", "number", "string"],
  },
  // other expression functions
  coalesce: {
    displayName: t`coalesce`,
    type: "expression",
    args: ["expression", "expression"],
    multiple: true,
  },
  case: {
    displayName: t`case`,
    type: "expression",
    args: ["expression", "expression"], // ideally we'd alternate boolean/expression
    multiple: true,
  },
  // boolean operators
  and: {
    displayName: t`AND`,
    type: "boolean",
    args: ["boolean", "boolean"],
  },
  or: {
    displayName: t`OR`,
    type: "boolean",
    args: ["boolean", "boolean"],
  },
  not: {
    displayName: t`NOT`,
    type: "boolean",
    args: ["boolean"],
  },
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
export function getExpressionName(mbqlName) {
  return MBQL_TO_EXPRESSION_NAME.get(mbqlName);
}
export function getMBQLName(expressionName) {
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
  "avg",
  "min",
  "max",
  "share",
  "var",
  "median",
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
  // number
  "abs",
  "floor",
  "ceil",
  "round",
  "sqrt",
  "power",
  "log",
  "exp",
  // boolean
  "contains",
  "ends-with",
  "starts-with",
  "between",
  "time-interval",
  // other
  "coalesce",
]);

export const EXPRESSION_OPERATORS = new Set(["+", "-", "*", "/"]);
export const FILTER_OPERATORS = new Set(["!=", "<=", ">=", "<", ">", "="]);

export const BOOLEAN_UNARY_OPERATORS = new Set(["not"]);
export const BOOLEAN_BINARY_OPERATORS = new Set(["and", "or"]);

export const FUNCTIONS = new Set([
  ...EXPRESSION_FUNCTIONS,
  ...AGGREGATION_FUNCTIONS,
]);

export const OPERATORS = new Set([
  ...EXPRESSION_OPERATORS,
  ...FILTER_OPERATORS,
  ...BOOLEAN_UNARY_OPERATORS,
  ...BOOLEAN_BINARY_OPERATORS,
]);
