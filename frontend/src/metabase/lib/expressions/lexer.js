import { Lexer, createToken } from "chevrotain";

import {
  VALID_AGGREGATIONS,
  NULLARY_AGGREGATIONS,
  UNARY_AGGREGATIONS,
} from "./config";

export const Identifier = createToken({
  name: "Identifier",
  pattern: /\w+/,
});
export const NumberLiteral = createToken({
  name: "NumberLiteral",
  pattern: /-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?/,
});
export const StringLiteral = createToken({
  name: "StringLiteral",
  pattern: /"(?:[^\\"]+|\\(?:[bfnrtv"\\/]|u[0-9a-fA-F]{4}))*"/,
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

export const Aggregation = createToken({
  name: "Aggregation",
  pattern: Lexer.NA,
});

export const NullaryAggregation = createToken({
  name: "NullaryAggregation",
  pattern: Lexer.NA,
  categories: [Aggregation],
});
const nullaryAggregationTokens = NULLARY_AGGREGATIONS.map(short =>
  createToken({
    name: VALID_AGGREGATIONS.get(short),
    pattern: new RegExp(VALID_AGGREGATIONS.get(short), "i"),
    categories: [NullaryAggregation],
    longer_alt: Identifier,
  }),
);

export const UnaryAggregation = createToken({
  name: "UnaryAggregation",
  pattern: Lexer.NA,
  categories: [Aggregation],
});
const unaryAggregationTokens = UNARY_AGGREGATIONS.map(short =>
  createToken({
    name: VALID_AGGREGATIONS.get(short),
    pattern: new RegExp(VALID_AGGREGATIONS.get(short), "i"),
    categories: [UnaryAggregation],
    longer_alt: Identifier,
  }),
);
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
  Aggregation,
  NullaryAggregation,
  ...nullaryAggregationTokens,
  UnaryAggregation,
  ...unaryAggregationTokens,
  StringLiteral,
  NumberLiteral,
  Identifier,
];

export const ExpressionLexer = new Lexer(allTokens);
