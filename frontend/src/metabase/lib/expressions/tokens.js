// Note: this file is imported by webpack.config.js

import { Lexer, extendToken } from "chevrotain";

import {
  VALID_AGGREGATIONS,
  NULLARY_AGGREGATIONS,
  UNARY_AGGREGATIONS,
} from "./config";

const AdditiveOperator = extendToken("AdditiveOperator", Lexer.NA);
const Plus = extendToken("Plus", /\+/, AdditiveOperator);
const Minus = extendToken("Minus", /-/, AdditiveOperator);

const MultiplicativeOperator = extendToken("MultiplicativeOperator", Lexer.NA);
const Multi = extendToken("Multi", /\*/, MultiplicativeOperator);
const Div = extendToken("Div", /\//, MultiplicativeOperator);

const Aggregation = extendToken("Aggregation", Lexer.NA);

const NullaryAggregation = extendToken("NullaryAggregation", Aggregation);
const nullaryAggregationTokens = NULLARY_AGGREGATIONS.map(short =>
  extendToken(
    VALID_AGGREGATIONS.get(short),
    new RegExp(VALID_AGGREGATIONS.get(short), "i"),
    NullaryAggregation,
  ),
);

const UnaryAggregation = extendToken("UnaryAggregation", Aggregation);
const unaryAggregationTokens = UNARY_AGGREGATIONS.map(short =>
  extendToken(
    VALID_AGGREGATIONS.get(short),
    new RegExp(VALID_AGGREGATIONS.get(short), "i"),
    UnaryAggregation,
  ),
);

const Identifier = extendToken("Identifier", /\w+/);
const NumberLiteral = extendToken(
  "NumberLiteral",
  /-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?/,
);
const StringLiteral = extendToken(
  "StringLiteral",
  /"(?:[^\\"]+|\\(?:[bfnrtv"\\/]|u[0-9a-fA-F]{4}))*"/,
);

const Comma = extendToken("Comma", /,/);
Comma.LABEL = "comma";

const LParen = extendToken("LParen", /\(/);
LParen.LABEL = "opening parenthesis";

const RParen = extendToken("RParen", /\)/);
RParen.LABEL = "closing parenthesis";

const WhiteSpace = extendToken("WhiteSpace", /\s+/);
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

// NOTE: webpack messes with the token name if exported directly, so export as a map of token names to tokens
export const tokens = {};
for (const token of allTokens) {
  tokens[token.name] = token;
}
