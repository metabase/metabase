import { Lexer, createToken } from "chevrotain";

import {
  getExpressionName as getExpressionName_,
  AGGREGATIONS,
  FUNCTIONS,
  FILTERS,
} from "./config";

function getExpressionName(mbqlName) {
  const expressionName = getExpressionName_(mbqlName);
  if (!expressionName) {
    throw new Error("Missing expression name for " + mbqlName);
  }
  return expressionName;
}

export const Identifier = createToken({
  name: "Identifier",
  pattern: /\w+/,
});
export const IdentifierString = createToken({
  name: "IdentifierString",
  pattern: /"(?:[^\\"]+|\\(?:[bfnrtv"\\/]|u[0-9a-fA-F]{4}))*"/,
});
export const NumberLiteral = createToken({
  name: "NumberLiteral",
  pattern: /-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?/,
});
export const StringLiteral = createToken({
  name: "StringLiteral",
  pattern: /'(?:[^\\']+|\\(?:[bfnrtv'\\/]|u[0-9a-fA-F]{4}))*'/,
});

export const AdditiveOperator = createToken({
  name: "AdditiveOperator",
  pattern: Lexer.NA,
});
export const Plus = createToken({
  name: "Plus",
  pattern: /\+/,
  categories: [AdditiveOperator],
});
export const Minus = createToken({
  name: "Minus",
  pattern: /-/,
  categories: [AdditiveOperator],
});

export const MultiplicativeOperator = createToken({
  name: "MultiplicativeOperator",
  pattern: Lexer.NA,
});
export const Multi = createToken({
  name: "Multi",
  pattern: /\*/,
  categories: [MultiplicativeOperator],
});
export const Div = createToken({
  name: "Div",
  pattern: /\//,
  categories: [MultiplicativeOperator],
});

export const AggregationName = createToken({
  name: "Aggregation",
  pattern: Lexer.NA,
});

const aggregationNameTokens = Array.from(AGGREGATIONS).map(short =>
  createToken({
    name: getExpressionName(short),
    pattern: new RegExp(getExpressionName(short), "i"),
    categories: [AggregationName],
    longer_alt: Identifier,
  }),
);

export const FunctionName = createToken({
  name: "FunctionName",
  pattern: Lexer.NA,
});

const functionNameTokens = Array.from(FUNCTIONS).map(short =>
  createToken({
    name: getExpressionName(short),
    pattern: new RegExp(getExpressionName(short), "i"),
    categories: [FunctionName],
    longer_alt: Identifier,
  }),
);

export const FilterName = createToken({
  name: "FilterName",
  pattern: Lexer.NA,
});

const filterNameTokens = Array.from(FILTERS).map(short =>
  createToken({
    name: getExpressionName(short),
    pattern: new RegExp(getExpressionName(short), "i"),
    categories: [FilterName],
    longer_alt: Identifier,
  }),
);

export const FilterOperator = createToken({
  name: "FilterOperator",
  pattern: Lexer.NA,
});

export const BooleanFilterOperator = createToken({
  name: "BooleanFilterOperator",
  pattern: Lexer.NA,
});

const filterOperatorTokens = [
  createToken({ name: "NE", pattern: /\!\=/, categories: [FilterOperator] }),
  createToken({ name: "LTE", pattern: /\<\=/, categories: [FilterOperator] }),
  createToken({ name: "GTE", pattern: /\>\=/, categories: [FilterOperator] }),
  createToken({ name: "LT", pattern: /\</, categories: [FilterOperator] }),
  createToken({ name: "GT", pattern: /\>/, categories: [FilterOperator] }),
  createToken({ name: "EQ", pattern: /\=/, categories: [FilterOperator] }),
  createToken({
    name: "And",
    pattern: /and/i,
    categories: [BooleanFilterOperator],
  }),
  createToken({
    name: "Or",
    pattern: /or/i,
    categories: [BooleanFilterOperator],
  }),
];

export const Comma = createToken({
  name: "Comma",
  pattern: /,/,
  label: "comma",
});

export const LParen = createToken({
  name: "LParen",
  pattern: /\(/,
  label: "opening parenthesis",
});

export const RParen = createToken({
  name: "RParen",
  pattern: /\)/,
  label: "closing parenthesis",
});

export const WhiteSpace = createToken({
  name: "WhiteSpace",
  pattern: /\s+/,
  group: Lexer.SKIPPED,
});

// whitespace is normally very common so it is placed first to speed up the lexer
export const allTokens = [
  WhiteSpace,
  LParen,
  RParen,
  Comma,
  Plus,
  Minus,
  Multi,
  Div,
  AdditiveOperator,
  MultiplicativeOperator,
  AggregationName,
  ...aggregationNameTokens,
  FunctionName,
  ...functionNameTokens,
  FilterName,
  ...filterNameTokens,
  FilterOperator,
  BooleanFilterOperator,
  ...filterOperatorTokens,
  StringLiteral,
  NumberLiteral,
  IdentifierString,
  // must come last:
  Identifier,
];

export const lexer = new Lexer(allTokens);
