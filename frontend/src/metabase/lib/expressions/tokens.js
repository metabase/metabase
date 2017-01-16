/* eslint-disable import/no-commonjs */
// Note: this file is imported by webpack.config.js, must be a CommonJS module

const { Lexer, extendToken } = require("chevrotain");

exports.VALID_OPERATORS = new Set([
    '+',
    '-',
    '*',
    '/'
]);

const VALID_AGGREGATIONS = exports.VALID_AGGREGATIONS = new Map(Object.entries({
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

const NULLARY_AGGREGATIONS = exports.NULLARY_AGGREGATIONS = ["count", "cum_count"];
const UNARY_AGGREGATIONS = exports.UNARY_AGGREGATIONS = ["sum", "cum_sum", "distinct", "stddev", "avg", "min", "max"];

const AdditiveOperator = exports.AdditiveOperator = extendToken("AdditiveOperator", Lexer.NA);
const Plus = exports.Plus = extendToken("Plus", /\+/, AdditiveOperator);
const Minus = exports.Minus = extendToken("Minus", /-/, AdditiveOperator);

const MultiplicativeOperator = exports.MultiplicativeOperator = extendToken("MultiplicativeOperator", Lexer.NA);
const Multi = exports.Multi = extendToken("Multi", /\*/, MultiplicativeOperator);
const Div = exports.Div = extendToken("Div", /\//, MultiplicativeOperator);

const Aggregation = exports.Aggregation = extendToken("Aggregation", Lexer.NA);

const NullaryAggregation = exports.NullaryAggregation = extendToken("NullaryAggregation", Aggregation);
const nullaryAggregationTokens = NULLARY_AGGREGATIONS.map((short) =>
    extendToken(VALID_AGGREGATIONS.get(short), new RegExp(VALID_AGGREGATIONS.get(short), "i"), NullaryAggregation)
);

const UnaryAggregation = exports.UnaryAggregation = extendToken("UnaryAggregation", Aggregation);
const unaryAggregationTokens = UNARY_AGGREGATIONS.map((short) =>
    extendToken(VALID_AGGREGATIONS.get(short), new RegExp(VALID_AGGREGATIONS.get(short), "i"), UnaryAggregation)
);

const Identifier = exports.Identifier = extendToken('Identifier', /\w+/);
const NumberLiteral = exports.NumberLiteral = extendToken("NumberLiteral", /-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?/);
const StringLiteral = exports.StringLiteral = extendToken("StringLiteral", /"(?:[^\\"]+|\\(?:[bfnrtv"\\/]|u[0-9a-fA-F]{4}))*"/);

const Comma = exports.Comma = extendToken('Comma', /,/);
Comma.LABEL = "comma";

const LParen = exports.LParen = extendToken('LParen', /\(/);
LParen.LABEL = "opening parenthesis";

const RParen = exports.RParen = extendToken('RParen', /\)/);
RParen.LABEL = "closing parenthesis";

const WhiteSpace = exports.WhiteSpace = extendToken("WhiteSpace", /\s+/);
WhiteSpace.GROUP = Lexer.SKIPPED;

// whitespace is normally very common so it is placed first to speed up the lexer
exports.allTokens = [
    WhiteSpace, LParen, RParen, Comma,
    Plus, Minus, Multi, Div,
    AdditiveOperator, MultiplicativeOperator,
    Aggregation,
    NullaryAggregation, ...nullaryAggregationTokens,
    UnaryAggregation, ...unaryAggregationTokens,
    StringLiteral, NumberLiteral,
    Identifier
];
