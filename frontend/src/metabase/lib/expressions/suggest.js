import _ from "underscore";
import { t } from "ttag";
import escape from "regexp.escape";

import {
  getExpressionName,
  // dimensions:
  getDimensionName,
  formatDimensionName,
  // metrics
  formatMetricName,
  // segments
  formatSegmentName,
  FILTER_FUNCTIONS,
} from "../expressions";

import { parserWithRecovery } from "./parser";

import {
  AdditiveOperator,
  AggregationFunctionName,
  BooleanOperatorBinary,
  BooleanOperatorUnary,
  CLAUSE_TOKENS,
  Case,
  Comma,
  FilterOperator,
  FunctionName,
  Identifier,
  IdentifierString,
  LParen,
  Minus,
  MultiplicativeOperator,
  NumberLiteral,
  RParen,
  StringLiteral,
  UnclosedQuotedString,
  getSubTokenTypes,
  isTokenType,
  lexerWithRecovery,
} from "./lexer";

import { ExpressionDimension } from "metabase-lib/lib/Dimension";
import { EXPRESSION_FUNCTIONS } from "./config";

function getTokenSource(tokenType) {
  return typeof tokenType.PATTERN === "string"
    ? tokenType.PATTERN
    : tokenType.PATTERN.source.replace(/^\\/, "");
}

const START_RULE_TYPE = {
  filter: "boolean",
  expression: "expression",
  aggregation: "aggregation",
};
export function suggest(
  source,
  { query, startRule, index = source.length, expressionName } = {},
) {
  const partialSource = source.slice(0, index);
  const lexResult = lexerWithRecovery.tokenize(partialSource);
  if (lexResult.errors.length > 0) {
    throw new Error(t`sad sad panda, lexing errors detected`);
  }

  let partialSuggestionMode = false;
  let assistanceTokenVector = lexResult.tokens;

  const lastInputToken = _.last(lexResult.tokens);
  const lastInputTokenIsUnclosedIdentifierString =
    lastInputToken &&
    isTokenType(lastInputToken.tokenType, UnclosedQuotedString) &&
    isTokenType(lastInputToken.tokenType, IdentifierString);
  // we have requested assistance while inside an Identifier or Unclosed IdentifierString
  if (
    lastInputToken &&
    ((isTokenType(lastInputToken.tokenType, Identifier) &&
      /\w/.test(partialSource[partialSource.length - 1])) ||
      lastInputTokenIsUnclosedIdentifierString)
  ) {
    assistanceTokenVector = assistanceTokenVector.slice(0, -1);
    partialSuggestionMode = true;
  }

  const { token: functionToken, index: functionArgumentIndex } =
    getFunctionTokenAndArgument(assistanceTokenVector) || {};
  const functionClause =
    functionToken && CLAUSE_TOKENS.get(functionToken.tokenType);

  const expectedType = functionClause
    ? functionClause.args[functionArgumentIndex]
    : START_RULE_TYPE[startRule];

  let finalSuggestions = [];

  const syntacticSuggestions = parserWithRecovery.computeContentAssist(
    startRule,
    assistanceTokenVector,
  );

  for (const suggestion of syntacticSuggestions) {
    const { nextTokenType, ruleStack } = suggestion;

    // first to avoid skipping if lastInputTokenIsUnclosedIdentifierString
    if (nextTokenType === Identifier || nextTokenType === IdentifierString) {
      // fields, metrics, segments
      const parentRule = ruleStack.slice(-2, -1)[0];
      const isDimension =
        parentRule === "dimensionExpression" && expectedType === "expression";
      const isSegment =
        parentRule === "segmentExpression" && expectedType === "boolean";
      const isMetric =
        parentRule === "metricExpression" && expectedType === "aggregation";

      const trimOptions = lastInputTokenIsUnclosedIdentifierString
        ? {
            // use the last token's pattern anchored to the end of the text
            prefixTrim: new RegExp(
              lastInputToken.tokenType.PATTERN.source + "$",
            ),
          }
        : { prefixTrim: /\w+$/, postfixTrim: /^\w+\s*/ };

      if (isDimension) {
        let dimensions = [];
        if (
          functionToken &&
          isTokenType(functionToken.tokenType, AggregationFunctionName)
        ) {
          dimensions = query
            .aggregationFieldOptions(functionClause.clause)
            .all();
        } else {
          dimensions = query
            .dimensionOptions(
              d =>
                // numeric
                // d.field().isNumeric() &&
                // not itself
                !(
                  d instanceof ExpressionDimension &&
                  d.name() === expressionName
                ),
            )
            .all();
        }
        finalSuggestions.push(
          ...dimensions.map(dimension => ({
            type: "fields",
            name: getDimensionName(dimension),
            text: formatDimensionName(dimension) + " ",
            ...trimOptions,
          })),
        );
      }
      if (isSegment) {
        finalSuggestions.push(
          ...query.table().segments.map(segment => ({
            type: "segments",
            name: segment.name,
            text: formatSegmentName(segment),
            ...trimOptions,
          })),
        );
      }
      if (isMetric) {
        finalSuggestions.push(
          ...query.table().metrics.map(metric => ({
            type: "metrics",
            name: metric.name,
            text: formatMetricName(metric),
            ...trimOptions,
          })),
        );
      }
    } else if (lastInputTokenIsUnclosedIdentifierString) {
      // skip the rest
    } else if (
      nextTokenType === AdditiveOperator ||
      nextTokenType === MultiplicativeOperator
    ) {
      if (expectedType === "expression" || expectedType === "aggregation") {
        const tokens = getSubTokenTypes(nextTokenType);
        finalSuggestions.push(
          ...tokens.map(token => operatorSuggestion(token)),
        );
      }
    } else if (
      nextTokenType === BooleanOperatorUnary ||
      nextTokenType === BooleanOperatorBinary ||
      nextTokenType === FilterOperator
    ) {
      if (expectedType === "boolean") {
        const tokens = getSubTokenTypes(nextTokenType);
        finalSuggestions.push(
          ...tokens.map(token => operatorSuggestion(token)),
        );
      }
    } else if (nextTokenType === LParen) {
      finalSuggestions.push({
        type: "other",
        name: "(",
        text: " (",
        postfixText: ")",
        prefixTrim: /\s*$/,
        postfixTrim: /^\s*\(?\s*/,
      });
    } else if (nextTokenType === RParen) {
      finalSuggestions.push({
        type: "other",
        name: ")",
        text: ") ",
        prefixTrim: /\s*$/,
        postfixTrim: /^\s*\)?\s*/,
      });
    } else if (nextTokenType === Comma) {
      if (
        functionClause &&
        (functionClause.multiple ||
          functionArgumentIndex < functionClause.args.length - 1)
      ) {
        finalSuggestions.push({
          type: "other",
          name: ",",
          text: ", ",
          postfixText: ",",
          prefixTrim: /\s*$/,
          postfixTrim: /^\s*,?\s*/,
        });
      }
    } else if (isTokenType(nextTokenType, FunctionName)) {
      if (expectedType === "aggregation") {
        finalSuggestions.push(
          ...query
            .aggregationOperatorsWithoutRows()
            .filter(a => getExpressionName(a.short))
            .map(aggregationOperator =>
              functionSuggestion(
                "aggregations",
                aggregationOperator.short,
                aggregationOperator.fields.length > 0,
              ),
            ),
        );
      } else if (expectedType === "expression") {
        finalSuggestions.push(
          ...Array.from(EXPRESSION_FUNCTIONS).map(clause =>
            functionSuggestion("functions", clause),
          ),
        );
      } else if (expectedType === "boolean") {
        finalSuggestions.push(
          ...Array.from(FILTER_FUNCTIONS).map(clause =>
            functionSuggestion("functions", clause),
          ),
        );
      }
    } else if (nextTokenType === Case) {
      if (expectedType === "expression") {
        finalSuggestions.push(functionSuggestion("functions", "case"));
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
    const partial = lastInputTokenIsUnclosedIdentifierString
      ? lastInputToken.image.slice(1).toLowerCase()
      : lastInputToken.image.toLowerCase();
    for (const suggestion of finalSuggestions) {
      suggestion: for (const text of [suggestion.name, suggestion.text]) {
        let index = 0;
        for (const part of (text || "").toLowerCase().split(/\b/g)) {
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
    suggestion.index = index;
    if (!suggestion.name) {
      suggestion.name = suggestion.text;
    }
  }

  // deduplicate suggestions and sort by type then name
  return _.chain(finalSuggestions)
    .uniq(suggestion => suggestion.text)
    .sortBy("name")
    .sortBy("type")
    .value();
}

export function getFunctionTokenAndArgument(tokens) {
  let parens = 0;
  let index = 0;
  // iterates over tokens backwards, keeping track of parens and argument positions
  for (let i = tokens.length - 1; i >= 0; i--) {
    const token = tokens[i];
    if (isTokenType(token.tokenType, FunctionName) && parens === -1) {
      return { token, index };
    } else if (token.tokenType === LParen) {
      parens--;
    } else if (token.tokenType === RParen) {
      parens++;
    } else if (token.tokenType === Comma && parens === 0) {
      index++;
    }
  }
}

function operatorSuggestion(token) {
  const source = getTokenSource(token);
  return {
    type: "operators",
    name: source,
    text: " " + source + " ",
    prefixTrim: /\s*$/,
    postfixTrim: new RegExp("/^s*" + escape(source) + "?s*/"),
  };
}

function functionSuggestion(type, clause, parens = true) {
  const name = getExpressionName(clause);
  return {
    type: type,
    name: name,
    text: name + (parens ? "(" : " "),
    postfixText: parens ? ")" : " ",
    prefixTrim: /\w+$/,
    postfixTrim: parens ? /^\w+(\(\)?|$)/ : /^\w+\s*/,
  };
}
