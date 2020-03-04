import { Lexer, createToken } from "chevrotain";
import escape from "regexp.escape";
import memoize from "lodash.memoize";

import {
  FILTER_OPERATORS,
  BOOLEAN_BINARY_OPERATORS,
  BOOLEAN_UNARY_OPERATORS,
  AGGREGATION_FUNCTIONS,
  EXPRESSION_FUNCTIONS,
  FILTER_FUNCTIONS,
  MBQL_CLAUSES,
  QUOTES,
} from "./config";

export const CLAUSE_TOKENS = new Map();
function createClauseToken(name, categories = []) {
  const clause = MBQL_CLAUSES[name];
  if (!clause) {
    throw new Error(`MBQL_CLAUSE: ${clause} is missing`);
  }
  const { displayName, tokenName = displayName } = clause;
  if (!tokenName) {
    throw new Error(
      `MBQL_CLAUSE: ${clause} is missing a tokenName or displayName`,
    );
  }
  const token = createToken({
    name: tokenName,
    pattern: new RegExp(escape(displayName), "i"),
    categories: categories,
    longer_alt: Identifier.PATTERN.test(displayName) ? Identifier : null,
  });
  CLAUSE_TOKENS.set(token, clause);
  return token;
}

export const Identifier = createToken({
  name: "Identifier",
  pattern: /\w+/,
});
export const IdentifierString = createToken({
  name: "IdentifierString",
  pattern: Lexer.NA,
});
export const StringLiteral = createToken({
  name: "StringLiteral",
  pattern: Lexer.NA,
});
export const NumberLiteral = createToken({
  name: "NumberLiteral",
  pattern: /-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?/,
});

// OPERATORS

export const Operator = createToken({
  name: "Operator",
  pattern: Lexer.NA,
});

// EXPRESSION OEPRATORS

export const AdditiveOperator = createToken({
  name: "AdditiveOperator",
  pattern: Lexer.NA,
  categories: [Operator],
});
export const Plus = createClauseToken("+", [AdditiveOperator]);
export const Minus = createClauseToken("-", [AdditiveOperator]);

export const MultiplicativeOperator = createToken({
  name: "MultiplicativeOperator",
  pattern: Lexer.NA,
  categories: [Operator],
});
export const Multi = createClauseToken("*", [MultiplicativeOperator]);
export const Div = createClauseToken("/", [MultiplicativeOperator]);

// FILTER OPERATORS:

export const FilterOperator = createToken({
  name: "FilterOperator",
  pattern: Lexer.NA,
  categories: [Operator],
});

for (const clause of Array.from(FILTER_OPERATORS)) {
  createClauseToken(clause, [FilterOperator]);
}

// BOOLEAN OEPRATORS

export const BooleanOperatorUnary = createToken({
  name: "BooleanOperatorUnary",
  pattern: Lexer.NA,
});

for (const clause of Array.from(BOOLEAN_UNARY_OPERATORS)) {
  createClauseToken(clause, [BooleanOperatorUnary]);
}

export const BooleanOperatorBinary = createToken({
  name: "BooleanOperatorBinary",
  pattern: Lexer.NA,
});

for (const clause of Array.from(BOOLEAN_BINARY_OPERATORS)) {
  createClauseToken(clause, [BooleanOperatorBinary]);
}

// FUNCTIONS

export const FunctionName = createToken({
  name: "FunctionName",
  pattern: Lexer.NA,
});

// AGGREGATION

export const AggregationFunctionName = createToken({
  name: "AggregationFunctionName",
  pattern: Lexer.NA,
  categories: [FunctionName],
});

for (const clause of Array.from(AGGREGATION_FUNCTIONS)) {
  createClauseToken(clause, [AggregationFunctionName]);
}

// EXPRESSIONS

export const ExpressionFunctionName = createToken({
  name: "ExpressionFunctionName",
  pattern: Lexer.NA,
  categories: [FunctionName],
});

for (const clause of Array.from(EXPRESSION_FUNCTIONS)) {
  createClauseToken(clause, [ExpressionFunctionName]);
}

// special-case Case since it uses different syntax
export const Case = createClauseToken("case");

// FILTERS

export const FilterFunctionName = createToken({
  name: "FilterFunctionName",
  pattern: Lexer.NA,
  categories: [FunctionName],
});

for (const clause of Array.from(FILTER_FUNCTIONS)) {
  createClauseToken(clause, [FilterFunctionName]);
}

// MISC

export const Comma = createToken({
  name: "Comma",
  pattern: ",",
  label: "comma",
});

export const LParen = createToken({
  name: "LParen",
  pattern: "(",
  label: "opening parenthesis",
});

export const RParen = createToken({
  name: "RParen",
  pattern: ")",
  label: "closing parenthesis",
});

// QUOTED STRINGS

const getQuoteCategories = character => {
  return QUOTES.characters[character] === "literal"
    ? [StringLiteral]
    : QUOTES.characters[character] === "identifier"
    ? [IdentifierString]
    : [];
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

// WHITESPACE

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
  // OPERATORS
  Operator,
  AdditiveOperator,
  MultiplicativeOperator,
  FilterOperator,
  BooleanOperatorUnary,
  BooleanOperatorBinary,
  // FUNCTIONS
  FunctionName,
  AggregationFunctionName,
  ExpressionFunctionName,
  FilterFunctionName,
  // all clauses
  ...CLAUSE_TOKENS.keys(),
  // literals
  StringLiteral,
  NumberLiteral,
  // quoted strings
  BracketQuotedString,
  SingleQuotedString,
  DoubleQuotedString,
  // identifiers
  IdentifierString,
  // must come after keywords (which should have "longer_alt: Identifier" set)
  Identifier,
];

export const lexer = new Lexer(allTokens, {
  ensureOptimizations: true,
});

// recovery version of the lexer
export const RecoveryToken = createToken({
  name: "RecoveryToken",
  pattern: Lexer.NA,
});
export const UnclosedQuotedString = createToken({
  name: "UnclosedQuotedString",
  pattern: Lexer.NA,
});
export const UnclosedBracketQuotedString = createToken({
  name: "UnclosedBracketQuotedString",
  pattern: /\[[^\]]*/,
  categories: [RecoveryToken, UnclosedQuotedString, ...getQuoteCategories("[")],
});
export const UnclosedSingleQuotedString = createToken({
  name: "UnclosedSingleQuotedString",
  pattern: /'(?:[^\\']+|\\(?:[bfnrtv'\\/]|u[0-9a-fA-F]{4}))*/,
  categories: [RecoveryToken, UnclosedQuotedString, ...getQuoteCategories("'")],
});
export const UnclosedDoubleQuotedString = createToken({
  name: "DoubleQuoUnclosedDoubleQuotedStringtedString",
  pattern: /"(?:[^\\"]+|\\(?:[bfnrtv"\\/]|u[0-9a-fA-F]{4}))*/,
  categories: [RecoveryToken, UnclosedQuotedString, ...getQuoteCategories('"')],
});
export const Any = createToken({
  name: "Any",
  pattern: /(.|\n)+/,
  categories: [RecoveryToken],
});

export const lexerWithRecovery = new Lexer([
  ...allTokens,
  RecoveryToken,
  UnclosedQuotedString,
  UnclosedBracketQuotedString,
  UnclosedSingleQuotedString,
  UnclosedDoubleQuotedString,
  Any,
]);

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
