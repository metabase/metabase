import _ from "underscore";
import { t } from "ttag";

import { parser } from "./parser";

import {
  getExpressionName,
  getMBQLName,
  // dimensions:
  getDimensionName,
  formatDimensionName,
  // metrics
  formatMetricName,
} from "../expressions";

import {
  lexer,
  allTokens,
  LParen,
  RParen,
  AdditiveOperator,
  MultiplicativeOperator,
  AggregationFunctionName,
  FunctionName,
  Case,
  StringLiteral,
  NumberLiteral,
  Minus,
  Identifier,
  IdentifierString,
} from "./lexer";

import memoize from "lodash.memoize";

import { ExpressionDimension } from "metabase-lib/lib/Dimension";

function getImage(token) {
  return token.image;
}

const tokensByIdx = new Map(allTokens.map(t => [t.tokenTypeIdx, t]));

const isTokenType = memoize(
  (child, ancestor) => {
    return (
      child === ancestor ||
      child.CATEGORIES.some(token => isTokenType(token, ancestor))
    );
  },
  (child, ancestor) => `${child.tokenTypeIdx},${ancestor.tokenTypeIdx}`,
);

function getSubTokenTypes(TokenClass) {
  return TokenClass.categoryMatches.map(idx => tokensByIdx.get(idx));
}

function getTokenSource(TokenClass) {
  // strip regex escaping, e.x. "\+" -> "+"
  return TokenClass.PATTERN.source.replace(/^\\/, "");
}

export function suggest(
  source,
  { query, startRule, index = source.length, expressionName } = {},
) {
  const partialSource = source.slice(0, index);
  const lexResult = lexer.tokenize(partialSource);
  if (lexResult.errors.length > 0) {
    throw new Error(t`sad sad panda, lexing errors detected`);
  }

  const lastInputToken = _.last(lexResult.tokens);
  let partialSuggestionMode = false;
  let assistanceTokenVector = lexResult.tokens;

  // we have requested assistance while inside an Identifier
  if (
    lastInputToken &&
    isTokenType(lastInputToken.tokenType, Identifier) &&
    /\w/.test(partialSource[partialSource.length - 1])
  ) {
    assistanceTokenVector = assistanceTokenVector.slice(0, -1);
    partialSuggestionMode = true;
  }

  let finalSuggestions = [];

  // TODO: is there a better way to figure out which aggregation we're inside of?
  const currentAggregationToken = _.find(
    assistanceTokenVector.slice().reverse(),
    t => t && isTokenType(t.tokenType, AggregationFunctionName),
  );

  const syntacticSuggestions = parser.computeContentAssist(
    startRule,
    assistanceTokenVector,
  );

  for (const suggestion of syntacticSuggestions) {
    const { nextTokenType, ruleStack } = suggestion;
    // no nesting of aggregations or field references outside of aggregations
    // we have a predicate in the grammar to prevent nested aggregations but chevrotain
    // doesn't support predicates in content-assist mode, so we need this extra check
    const outsideAggregation =
      startRule === "aggregation" &&
      ruleStack.slice(0, -1).indexOf("aggregationExpression") < 0;

    if (
      nextTokenType === MultiplicativeOperator ||
      nextTokenType === AdditiveOperator
    ) {
      const tokens = getSubTokenTypes(nextTokenType);
      finalSuggestions.push(
        ...tokens.map(token => ({
          type: "operators",
          name: getTokenSource(token),
          text: " " + getTokenSource(token) + " ",
          prefixTrim: /\s*$/,
          postfixTrim: /^\s*[*/+-]?\s*/,
        })),
      );
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
    } else if (
      nextTokenType === Identifier ||
      nextTokenType === IdentifierString
    ) {
      if (!outsideAggregation) {
        let dimensions = [];
        if (startRule === "aggregation" && currentAggregationToken) {
          const aggregationShort = getMBQLName(
            getImage(currentAggregationToken),
          );
          dimensions = query.aggregationFieldOptions(aggregationShort).all();
        } else if (startRule === "expression") {
          dimensions = query
            .dimensionOptions(
              d =>
                // numeric
                d.field().isNumeric() &&
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
            prefixTrim: /\w+$/,
            postfixTrim: /^\w+\s*/,
          })),
        );
      }
    } else if (isTokenType(nextTokenType, FunctionName)) {
      if (outsideAggregation) {
        finalSuggestions.push(
          ...query
            .aggregationOperatorsWithoutRows()
            .filter(a => getExpressionName(a.short))
            .map(aggregationOperator => {
              const arity = aggregationOperator.fields.length;
              return {
                type: "aggregations",
                name: getExpressionName(aggregationOperator.short),
                text:
                  getExpressionName(aggregationOperator.short) +
                  (arity > 0 ? "(" : " "),
                postfixText: arity > 0 ? ")" : " ",
                prefixTrim: /\w+$/,
                postfixTrim: arity > 0 ? /^\w+(\(\)?|$)/ : /^\w+\s*/,
              };
            }),
        );
        finalSuggestions.push(
          ...query.table().metrics.map(metric => ({
            type: "metrics",
            name: metric.name,
            text: formatMetricName(metric),
            prefixTrim: /\w+$/,
            postfixTrim: /^\w+\s*/,
          })),
        );
      }
    } else if (nextTokenType === Case) {
      // TODO
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
    const partial = getImage(lastInputToken).toLowerCase();
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
