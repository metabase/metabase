import { Lexer, createToken } from "chevrotain";

import memoize from "lodash.memoize";

import {
  getExpressionName,
  AGGREGATION_FUNCTIONS,
  EXPRESSION_FUNCTIONS,
  FILTER_FUNCTIONS,
  MBQL_CLAUSES,
  QUOTES,
} from "./config";

export const Identifier = createToken({
  name: "Identifier",
  pattern: /\w+/,
});
export const IdentifierString = createToken({
  name: "IdentifierString",
  pattern: Lexer.NA,
});
export const NumberLiteral = createToken({
  name: "NumberLiteral",
  pattern: /-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?/,
});
export const StringLiteral = createToken({
  name: "StringLiteral",
  pattern: Lexer.NA,
});

export const Operator = createToken({
  name: "Operator",
  pattern: Lexer.NA,
});

export const AdditiveOperator = createToken({
  name: "AdditiveOperator",
  pattern: Lexer.NA,
  categories: [Operator],
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
  categories: [Operator],
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

export const FunctionName = createToken({
  name: "FunctionName",
  pattern: Lexer.NA,
});
export const FUNCTION_TOKENS = new Map();

function createFunctionToken(parentToken, clause, args, type) {
  if (!args) {
    throw new Error("Missing args for " + clause);
  }
  const name = getExpressionName(clause);
  if (!name) {
    throw new Error("Missing expression name for " + clause);
  }
  const token = createToken({
    name: name,
    pattern: new RegExp(name, "i"),
    categories: [parentToken],
    longer_alt: Identifier,
  });
  FUNCTION_TOKENS.set(token, { args, type });
}

// AGGREGATION

export const AggregationFunctionName = createToken({
  name: "AggregationFunctionName",
  pattern: Lexer.NA,
  categories: [FunctionName],
});

for (const clause of Array.from(AGGREGATION_FUNCTIONS)) {
  createFunctionToken(
    AggregationFunctionName,
    clause,
    MBQL_CLAUSES[clause].args,
    MBQL_CLAUSES[clause].type,
  );
}

// EXPRESSIONS

export const ExpressionFunctionName = createToken({
  name: "ExpressionFunctionName",
  pattern: Lexer.NA,
  categories: [FunctionName],
});

for (const clause of Array.from(EXPRESSION_FUNCTIONS)) {
  createFunctionToken(
    ExpressionFunctionName,
    clause,
    MBQL_CLAUSES[clause].args,
    MBQL_CLAUSES[clause].type,
  );
}

// special-case Case since it uses different syntax
export const Case = createToken({
  name: "Case",
  pattern: /Case/i,
  longer_alt: Identifier,
});

// FILTERS

export const FilterFunctionName = createToken({
  name: "FilterFunctionName",
  pattern: Lexer.NA,
  categories: [FunctionName],
});

for (const clause of Array.from(FILTER_FUNCTIONS)) {
  createFunctionToken(
    FilterFunctionName,
    clause,
    MBQL_CLAUSES[clause].args,
    MBQL_CLAUSES[clause].type,
  );
}

export const FilterOperator = createToken({
  name: "FilterOperator",
  pattern: Lexer.NA,
});

export const BooleanOperator = createToken({
  name: "BooleanOperator",
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
    name: "AND",
    pattern: /AND/i,
    categories: [BooleanOperator],
  }),
  createToken({
    name: "OR",
    pattern: /OR/i,
    categories: [BooleanOperator],
  }),
];

export const Not = createToken({
  name: "NOT",
  pattern: /NOT/i,
});

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

// quoted strings

const getQuoteCategories = quote => {
  const x =
    QUOTES[quote] === "literal"
      ? [StringLiteral]
      : QUOTES[quote] === "identifier"
      ? [IdentifierString]
      : [];
  return x;
};

export const BracketQuotedString = createToken({
  name: "BracketQuotedString",
  pattern: /\[[^\]]*\]/,
  categories: getQuoteCategories("["),
});
export const SingleQuotedString = createToken({
  name: "SingleQuotedString",
  pattern: /'(?:[^\\']+|\\(?:[bfnrtv'\\/]|u[0-9a-fA-F]{4}))*'/,
  categories: getQuoteCategories("'"),
});
export const DoubleQuotedString = createToken({
  name: "DoubleQuotedString",
  pattern: /"(?:[^\\"]+|\\(?:[bfnrtv"\\/]|u[0-9a-fA-F]{4}))*"/,
  categories: getQuoteCategories('"'),
});

export const WhiteSpace = createToken({
  name: "WhiteSpace",
  pattern: /\s+/,
  // group: Lexer.SKIPPED,
  group: "whitespace",
});

export const allTokens = [
  // whitespace is normally very common so it is placed first to speed up the lexer
  WhiteSpace,
  LParen,
  RParen,
  Comma,
  Plus,
  Minus,
  Multi,
  Div,
  Operator,
  AdditiveOperator,
  MultiplicativeOperator,
  // aggregation, expression, and filter functions:
  FunctionName,
  AggregationFunctionName,
  ExpressionFunctionName,
  FilterFunctionName,
  ...FUNCTION_TOKENS.keys(),
  // expression
  Case,
  // filter
  FilterOperator,
  BooleanOperator,
  Not,
  ...filterOperatorTokens,
  // literals
  StringLiteral,
  NumberLiteral,
  IdentifierString,
  // quoted strings
  BracketQuotedString,
  SingleQuotedString,
  DoubleQuotedString,
  // must come after keywords (which should have "longer_alt: Identifier" set)
  Identifier,
];

export const lexer = new Lexer(allTokens, {
  ensureOptimizations: true,
});

export const Any = createToken({
  name: "Any",
  pattern: /(.|\n)+/,
});
export const lexerWithAny = new Lexer([...allTokens, Any]);

export function getImage(token) {
  return token.image;
}

const tokensByIdx = new Map(allTokens.map(t => [t.tokenTypeIdx, t]));

export const isTokenType = memoize(
  (child, ancestor) => {
    return (
      child === ancestor ||
      child.CATEGORIES.some(token => isTokenType(token, ancestor))
    );
  },
  (child, ancestor) => `${child.tokenTypeIdx},${ancestor.tokenTypeIdx}`,
);

export function getSubTokenTypes(TokenClass) {
  return TokenClass.categoryMatches.map(idx => tokensByIdx.get(idx));
}
