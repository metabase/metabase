// Note: this file is imported by webpack.config.js

import { Lexer, extendToken } from "chevrotain";

import {
  VALID_AGGREGATIONS,
  NULLARY_AGGREGATIONS,
  UNARY_AGGREGATIONS,
} from "./config";

export const AdditiveOperator = extendToken("AdditiveOperator", Lexer.NA);
export const Plus = extendToken("Plus", /\+/, AdditiveOperator);
export const Minus = extendToken("Minus", /-/, AdditiveOperator);

export const MultiplicativeOperator = extendToken(
  "MultiplicativeOperator",
  Lexer.NA,
);
export const Multi = extendToken("Multi", /\*/, MultiplicativeOperator);
export const Div = extendToken("Div", /\//, MultiplicativeOperator);

export const Aggregation = extendToken("Aggregation", Lexer.NA);

export const NullaryAggregation = extendToken(
  "NullaryAggregation",
  Aggregation,
);
const nullaryAggregationTokens = NULLARY_AGGREGATIONS.map(short =>
  extendToken(
    VALID_AGGREGATIONS.get(short),
    new RegExp(VALID_AGGREGATIONS.get(short), "i"),
    NullaryAggregation,
  ),
);

export const UnaryAggregation = extendToken("UnaryAggregation", Aggregation);
const unaryAggregationTokens = UNARY_AGGREGATIONS.map(short =>
  extendToken(
    VALID_AGGREGATIONS.get(short),
    new RegExp(VALID_AGGREGATIONS.get(short), "i"),
    UnaryAggregation,
  ),
);

export const Identifier = extendToken("Identifier", /\w+/);
export const NumberLiteral = extendToken(
  "NumberLiteral",
  /-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?/,
);
export const StringLiteral = extendToken(
  "StringLiteral",
  /"(?:[^\\"]+|\\(?:[bfnrtv"\\/]|u[0-9a-fA-F]{4}))*"/,
);

export const Comma = extendToken("Comma", /,/);
Comma.LABEL = "comma";

export const LParen = extendToken("LParen", /\(/);
LParen.LABEL = "opening parenthesis";

export const RParen = extendToken("RParen", /\)/);
RParen.LABEL = "closing parenthesis";

export const WhiteSpace = extendToken("WhiteSpace", /\s+/);
WhiteSpace.GROUP = Lexer.SKIPPED;

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
