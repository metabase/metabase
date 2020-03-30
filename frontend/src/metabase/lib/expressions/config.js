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

export const EDITOR_FK_SYMBOLS = {
  // specifies which symbols can be used to delimit foreign/joined fields
  symbols: [".", " → "],
  // specifies the default/canonical symbol
  default: " → ",
};

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
    displayName: `Count`,
    type: "aggregation",
    args: [],
  },
  "cum-count": {
    displayName: `CumulativeCount`,
    type: "aggregation",
    args: [],
  },
  sum: {
    displayName: `Sum`,
    type: "aggregation",
    args: ["number"],
  },
  "cum-sum": {
    displayName: `CumulativeSum`,
    type: "aggregation",
    args: ["number"],
  },
  distinct: {
    displayName: `Distinct`,
    type: "aggregation",
    args: ["number"],
  },
  stddev: {
    displayName: `StandardDeviation`,
    type: "aggregation",
    args: ["number"],
  },
  avg: {
    displayName: `Average`,
    type: "aggregation",
    args: ["number"],
  },
  min: {
    displayName: `Min`,
    type: "aggregation",
    args: ["number"],
  },
  max: {
    displayName: `Max`,
    type: "aggregation",
    args: ["number"],
  },
  share: {
    displayName: `Share`,
    type: "aggregation",
    args: ["boolean"],
  },
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
  // expression functions
  lower: {
    displayName: `lower`,
    type: "string",
    args: ["string"],
  },
  upper: {
    displayName: `upper`,
    type: "string",
    args: ["string"],
  },
  substring: {
    displayName: `substring`,
    type: "string",
    args: ["string", "number", "number"],
  },
  "regex-match-first": {
    displayName: `regexextract`,
    type: "string",
    args: ["string", "string"],
    requiredFeatures: ["regex"],
  },
  concat: {
    displayName: `concat`,
    type: "string",
    args: ["expression"],
    multiple: true,
  },
  coalesce: {
    displayName: `coalesce`,
    type: "expression",
    args: ["expression", "expression"],
    multiple: true,
  },
  replace: {
    displayName: `substitute`,
    type: "string",
    args: ["string", "string", "string"],
  },
  trim: {
    displayName: `trim`,
    type: "string",
    args: ["string", "string"],
  },
  rtrim: {
    displayName: `rtrim`,
    type: "string",
    args: ["string"],
  },
  ltrim: {
    displayName: `ltrim`,
    type: "string",
    args: ["string"],
  },
  case: {
    displayName: `case`,
    type: "expression",
    args: ["expression", "expression"], // ideally we'd alternate boolean/expression
    multiple: true,
  },
  // filters functions
  contains: {
    displayName: `contains`,
    type: "boolean",
    args: ["string", "string"],
  },
  "starts-with": {
    displayName: `startsWith`,
    type: "boolean",
    args: ["string", "string"],
  },
  "ends-with": {
    displayName: `endsWith`,
    type: "boolean",
    args: ["string", "string"],
  },
  between: {
    displayName: `between`,
    type: "boolean",
    args: ["expression", "expression", "expression"],
  },
  "time-interval": {
    displayName: `interval`,
    type: "boolean",
    args: ["expression", "number", "string"],
  },
  // boolean operators
  and: {
    displayName: `AND`,
    type: "boolean",
    args: ["boolean", "boolean"],
  },
  or: {
    displayName: `OR`,
    type: "boolean",
    args: ["boolean", "boolean"],
  },
  not: {
    displayName: `NOT`,
    type: "boolean",
    args: ["boolean"],
  },
  // expression operators
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

export const EXPRESSION_FUNCTIONS = new Set([
  "lower", // concrete-field
  "upper", // concrete-field
  "substring", // concrete-field start length
  "regex-match-first", // concrete-field regex
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
