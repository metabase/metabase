// Note: this file is imported by webpack.config.js

import { Lexer, extendToken } from "chevrotain";

export const VALID_OPERATORS = new Set([
    '+',
    '-',
    '*',
    '/'
]);

export const VALID_AGGREGATIONS = new Map(Object.entries({
    "count": "Count",
    "cum_count": "CumulativeCount",
    "sum": "Sum",
    "cum_sum": "CumulativeSum",
    "distinct": "Distinct",
    "stddev": "StandardDeviation",
    "avg": "Average",
    "min": "Min",
    "max": "Max"
}));

export const AdditiveOperator = extendToken("AdditiveOperator", Lexer.NA);
export const Plus = extendToken("Plus", /\+/, AdditiveOperator);
export const Minus = extendToken("Minus", /-/, AdditiveOperator);

export const MultiplicativeOperator = extendToken("MultiplicativeOperator", Lexer.NA);
export const Multi = extendToken("Multi", /\*/, MultiplicativeOperator);
export const Div = extendToken("Div", /\//, MultiplicativeOperator);

export const Aggregation = extendToken("Aggregation", Lexer.NA);
export const aggregationsTokens = Array.from(VALID_AGGREGATIONS).map(([short, expressionName]) =>
    extendToken(expressionName, new RegExp(expressionName), Aggregation)
);

export const Identifier = extendToken('Identifier', /\w+/);
export const NumberLiteral = extendToken("NumberLiteral", /-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?/);
export const StringLiteral = extendToken("StringLiteral", /"(?:[^\\"]+|\\(?:[bfnrtv"\\/]|u[0-9a-fA-F]{4}))*"/);

export const Comma = extendToken('Comma', /,/);
export const LParen = extendToken('LParen', /\(/);
export const RParen = extendToken('RParen', /\)/);

export const WhiteSpace = extendToken("WhiteSpace", /\s+/);
WhiteSpace.GROUP = Lexer.SKIPPED;

// whitespace is normally very common so it is placed first to speed up the lexer
export const allTokens = [
    WhiteSpace, LParen, RParen, Comma,
    Plus, Minus, Multi, Div,
    AdditiveOperator, MultiplicativeOperator,
    Aggregation, ...aggregationsTokens,
    StringLiteral, NumberLiteral,
    Identifier
];
