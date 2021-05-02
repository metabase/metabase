import _ from "underscore";

import {
  getExpressionName,
  // dimensions:
  getDimensionName,
  formatDimensionName,
  // metrics
  formatMetricName,
  // segments
  formatSegmentName,
} from "../expressions";

import {
  parserWithRecovery,
  ExpressionCstVisitor,
  ExpressionParser,
} from "./parser";

import {
  AggregationFunctionName,
  CLAUSE_TOKENS,
  Case,
  FunctionName,
  Identifier,
  IdentifierString,
  LParen,
  Minus,
  NumberLiteral,
  StringLiteral,
  isTokenType,
  lexerWithRecovery,
} from "./lexer";

import { partialMatch, enclosingFunction } from "./completer";

import getHelpText from "./helper_text_strings";

import { ExpressionDimension } from "metabase-lib/lib/Dimension";
import {
  FUNCTIONS,
  OPERATORS,
  MBQL_CLAUSES,
  isExpressionType,
  getFunctionArgType,
  getMBQLName,
  EXPRESSION_TYPES,
  EDITOR_FK_SYMBOLS,
} from "./config";

const FUNCTIONS_BY_TYPE = {};
const OPERATORS_BY_TYPE = {};
for (const type of EXPRESSION_TYPES) {
  FUNCTIONS_BY_TYPE[type] = Array.from(FUNCTIONS)
    .filter(name => isExpressionType(MBQL_CLAUSES[name].type, type))
    .map(name => MBQL_CLAUSES[name]);
  OPERATORS_BY_TYPE[type] = Array.from(OPERATORS)
    .filter(name => isExpressionType(MBQL_CLAUSES[name].type, type))
    .map(name => MBQL_CLAUSES[name]);
}

export function suggest({
  source,
  cst,
  query,
  startRule,
  targetOffset = source.length,
  expressionName,
} = {}) {
  const partialSource = source.slice(0, targetOffset);

  const matchPrefix = partialMatch(partialSource);
  const partialSuggestionMode =
    matchPrefix && matchPrefix.length > 0 && _.last(matchPrefix) !== "]";

  if (!partialSuggestionMode) {
    const functionDisplayName = enclosingFunction(partialSource);
    if (functionDisplayName) {
      const helpText = getHelpText(getMBQLName(functionDisplayName));
      if (helpText) {
        return { helpText };
      }
    }
  }

  const lexResult = lexerWithRecovery.tokenize(partialSource);
  if (lexResult.errors.length > 0) {
    throw lexResult.errors;
  }
  let tokenVector = lexResult.tokens;
  if (partialSuggestionMode) {
    tokenVector = tokenVector.slice(0, -1);
  }
  const context = getContext({
    cst,
    tokenVector,
    targetOffset,
    startRule,
  }) || { expectedType: startRule };

  const { expectedType } = context;

  let finalSuggestions = [];

  const syntacticSuggestions = parserWithRecovery.computeContentAssist(
    startRule,
    tokenVector,
  );

  for (const suggestion of syntacticSuggestions) {
    const { nextTokenType, ruleStack } = suggestion;

    // first to avoid skipping if lastInputTokenIsUnclosedIdentifierString
    if (nextTokenType === Identifier || nextTokenType === IdentifierString) {
      // fields, metrics, segments
      const parentRule = ruleStack.slice(-2, -1)[0];
      const isDimension =
        parentRule === "identifierExpression" &&
        (isExpressionType(expectedType, "expression") ||
          isExpressionType(expectedType, "boolean"));
      const isSegment =
        parentRule === "identifierExpression" &&
        isExpressionType(expectedType, "boolean");
      const isMetric =
        parentRule === "identifierExpression" &&
        isExpressionType(expectedType, "aggregation");

      if (isDimension) {
        let dimensions = [];
        if (
          context.token &&
          context.clause &&
          isTokenType(context.token.tokenType, AggregationFunctionName)
        ) {
          dimensions = query.aggregationFieldOptions(context.clause.name).all();
        } else {
          const dimensionFilter = dimension => {
            // not itself
            if (
              dimension instanceof ExpressionDimension &&
              dimension.name() === expressionName
            ) {
              return false;
            }
            if (expectedType === "expression" || expectedType === "boolean") {
              return true;
            }
            const field = dimension.field();
            return (
              (isExpressionType("number", expectedType) && field.isNumeric()) ||
              (isExpressionType("string", expectedType) && field.isString())
            );
          };
          dimensions = query.dimensionOptions(dimensionFilter).all();
        }
        finalSuggestions.push(
          ...dimensions.map(dimension => ({
            type: "fields",
            name: getDimensionName(dimension),
            text: formatDimensionName(dimension) + " ",
            alternates: EDITOR_FK_SYMBOLS.symbols.map(symbol =>
              getDimensionName(dimension, symbol),
            ),
          })),
        );
      }
      if (isSegment) {
        finalSuggestions.push(
          ...query.table().segments.map(segment => ({
            type: "segments",
            name: segment.name,
            text: formatSegmentName(segment),
          })),
        );
      }
      if (isMetric) {
        finalSuggestions.push(
          ...query.table().metrics.map(metric => ({
            type: "metrics",
            name: metric.name,
            text: formatMetricName(metric),
          })),
        );
      }
    } else if (
      isTokenType(nextTokenType, FunctionName) ||
      nextTokenType === Case
    ) {
      const database = query.database();
      let functions = [];
      if (isExpressionType(expectedType, "aggregation")) {
        // special case for aggregation
        finalSuggestions.push(
          // ...query
          //   .aggregationOperatorsWithoutRows()
          //   .filter(a => getExpressionName(a.short))
          //   .map(aggregationOperator =>
          //     functionSuggestion(
          //       "aggregations",
          //       aggregationOperator.short,
          //       aggregationOperator.fields.length > 0,
          //     ),
          //   ),
          ...FUNCTIONS_BY_TYPE["aggregation"]
            .filter(clause => database.hasFeature(clause.requiresFeature))
            .map(clause =>
              functionSuggestion(
                "aggregations",
                clause.name,
                clause.args.length > 0,
              ),
            ),
        );
        finalSuggestions.push(
          ...["sum-where", "count-where", "share"].map(short =>
            functionSuggestion("aggregations", short, true),
          ),
        );
        functions = FUNCTIONS_BY_TYPE["number"];
      } else {
        functions = FUNCTIONS_BY_TYPE[expectedType];
      }
      finalSuggestions.push(
        ...functions
          .filter(clause => database.hasFeature(clause.requiresFeature))
          .map(clause => functionSuggestion("functions", clause.name)),
      );
      if (nextTokenType === Case) {
        const caseSuggestion = {
          type: "functions",
          name: "case",
          text: "case(",
        };
        finalSuggestions.push(caseSuggestion);
      }
    } else if (
      nextTokenType === StringLiteral ||
      nextTokenType === NumberLiteral ||
      nextTokenType === Minus
    ) {
      // skip number/string literal
    } else {
      console.warn("non exhaustive match", nextTokenType.name);
    }
  }

  // throw away any suggestion that is not a suffix of the last partialToken.
  if (partialSuggestionMode) {
    const partial = matchPrefix.toLowerCase();
    for (const suggestion of finalSuggestions) {
      suggestion: for (const text of [
        suggestion.name,
        suggestion.text,
        ...(suggestion.alternates || []),
      ]) {
        const lower = (text || "").toLowerCase();
        if (lower.startsWith(partial)) {
          suggestion.range = [0, partial.length];
          break suggestion;
        }
        let index = 0;
        for (const part of lower.split(/\b/g)) {
          if (part.startsWith(partial)) {
            suggestion.range = [index, index + partial.length];
            break suggestion;
          }
          index += part.length;
        }
      }
    }
    finalSuggestions = finalSuggestions.filter(suggestion => suggestion.range);
  }
  for (const suggestion of finalSuggestions) {
    suggestion.index = targetOffset;
    if (!suggestion.name) {
      suggestion.name = suggestion.text;
    }
  }

  // deduplicate suggestions and sort by type then name
  return {
    suggestions: _.chain(finalSuggestions)
      .uniq(suggestion => suggestion.text)
      .sortBy("name")
      .sortBy("type")
      .value(),
  };
}

function functionSuggestion(type, clause, parens = true) {
  const name = getExpressionName(clause);
  return {
    type: type,
    name: name,
    text: name + (parens ? "(" : " "),
  };
}

const contextParser = new ExpressionParser({
  recoveryEnabled: true,
  tokenRecoveryEnabled: false,
});

export function getContext({
  source,
  cst,
  tokenVector = lexerWithRecovery.tokenize(source).tokens,
  targetOffset = source.length,
  startRule,
  ...options
}) {
  if (!cst) {
    contextParser.input = tokenVector;
    cst = contextParser[startRule]();
  }
  const visitor = new ExpressionContextVisitor({
    targetOffset: targetOffset,
    tokenVector: tokenVector,
    ...options,
  });
  return visitor.visit(cst);
}

function findNextTextualToken(tokenVector, prevTokenEndOffset) {
  // The TokenVector is sorted, so we could use a BinarySearch to optimize performance
  const prevTokenIdx = tokenVector.findIndex(
    tok => tok.endOffset === prevTokenEndOffset,
  );
  for (let i = prevTokenIdx + 1; i >= 0 && i < tokenVector.length; i++) {
    if (!/^\s+$/.test(tokenVector[i].image)) {
      return tokenVector[i];
    }
  }
  return null;
}

export class ExpressionContextVisitor extends ExpressionCstVisitor {
  constructor({ targetOffset, tokenVector }) {
    super();
    this.targetOffset = targetOffset;
    this.tokenVector = tokenVector;
    this.stack = [];
    this.validateVisitor();
  }

  _context(clauseToken, index, currentContext) {
    const clause = CLAUSE_TOKENS.get(clauseToken.tokenType);
    let expectedType = getFunctionArgType(clause, index);

    if (
      (expectedType === "expression" || expectedType === "number") &&
      currentContext &&
      currentContext.expectedType === "aggregation" &&
      clause.type !== "aggregation"
    ) {
      expectedType = "aggregation";
    }

    return { clause, index, expectedType, clauseToken };
  }

  _isTarget(token) {
    const { targetOffset, tokenVector } = this;
    const next = findNextTextualToken(tokenVector, token.endOffset);
    if (
      targetOffset > token.endOffset &&
      (next === null || targetOffset <= next.startOffset)
    ) {
      return true;
    }
    return false;
  }

  _function(ctx, currentContext) {
    const { tokenVector } = this;
    const clauseToken = ctx.functionName[0];
    // special case: function clauses without parens sometimes causes the paren to be missing
    const parenToken = ctx.LParen
      ? ctx.LParen[0]
      : findNextTextualToken(tokenVector, clauseToken.endOffset);
    if (!parenToken || parenToken.tokenType !== LParen) {
      return;
    }
    const tokens = [parenToken, ...(ctx.Comma || [])];
    for (let index = 0; index < tokens.length; index++) {
      const token = tokens[index];
      if (this._isTarget(token)) {
        return this._context(clauseToken, index, currentContext);
      } else if (ctx.arguments && index < ctx.arguments.length) {
        const match = this.visit(
          ctx.arguments[index],
          this._context(clauseToken, index, currentContext),
        );
        if (match) {
          return match;
        }
      }
    }
  }

  _operator(ctx, currentContext) {
    // note: this should probably account for operator precedence / associativity but for now all of our operator clauses contain operators of the same precedence/associativity
    for (let index = 0; index < ctx.operators.length; index++) {
      const clauseToken = ctx.operators[index];
      if (this._isTarget(clauseToken)) {
        // NOTE: operators always (?) have the same type for every operand
        return this._context(clauseToken, 0, currentContext);
      } else {
        const match = this.visit(
          ctx.operands[index],
          this._context(clauseToken, 0, currentContext),
        );
        if (match) {
          return match;
        }
      }
    }
  }
}

const ALL_RULES = [
  "any",
  "expression",
  "aggregation",
  "boolean",
  "string",
  "number",
  "additionExpression",
  "multiplicationExpression",
  "functionExpression",
  "caseExpression",
  "identifierExpression",
  "identifier",
  "identifierString",
  "stringLiteral",
  "numberLiteral",
  "atomicExpression",
  "parenthesisExpression",
  "booleanExpression",
  "booleanUnaryExpression",
  "relationalExpression",
  "logicalAndExpression",
  "logicalOrExpression",
  "logicalNotExpression",
];

const TYPE_RULES = new Set([
  "expression",
  "aggregation",
  "boolean",
  "string",
  "number",
]);

for (const rule of ALL_RULES) {
  ExpressionContextVisitor.prototype[rule] = function(ctx, currentContext) {
    if (!currentContext && TYPE_RULES.has(rule)) {
      currentContext = { expectedType: rule };
    }

    // if we have operators or a functionName then handle that specially
    if (ctx.operators) {
      const match = this._operator(ctx, currentContext);
      if (match) {
        return match;
      }
    }
    if (ctx.functionName) {
      const match = this._function(ctx, currentContext);
      if (match) {
        return match;
      }
    }

    // this just visits every child
    for (const type in ctx) {
      for (const child of ctx[type]) {
        if (!child.tokenType && child.name) {
          const match = this.visit(child, currentContext);
          if (match) {
            return match;
          }
        } else if (this._isTarget(child)) {
          return currentContext;
        }
      }
    }
  };
}
