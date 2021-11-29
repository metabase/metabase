import _ from "underscore";

import {
  getDimensionName,
  formatDimensionName,
  formatMetricName,
  formatSegmentName,
} from "../expressions";

import { partialMatch, enclosingFunction } from "./completer";

import getHelpText from "./helper_text_strings";

import {
  EXPRESSION_FUNCTIONS,
  AGGREGATION_FUNCTIONS,
  MBQL_CLAUSES,
  getMBQLName,
  EDITOR_FK_SYMBOLS,
} from "./config";

export function suggest({
  source,
  query,
  startRule,
  targetOffset = source.length,
} = {}) {
  let suggestions = [];

  const partialSource = source.slice(0, targetOffset);
  const matchPrefix = partialMatch(partialSource);

  if (!matchPrefix || _.last(matchPrefix) === "]") {
    // no keystroke to match? show help text for the enclosing function
    const functionDisplayName = enclosingFunction(partialSource);
    if (functionDisplayName) {
      const helpText = getHelpText(getMBQLName(functionDisplayName));
      if (helpText) {
        return { suggestions, helpText };
      }
    }
    return { suggestions };
  }

  if (_.first(matchPrefix) !== "[") {
    suggestions.push({
      type: "functions",
      name: "case",
      text: "case(",
      index: targetOffset,
      icon: "function",
      order: 1,
    });
    suggestions.push(
      ...Array.from(EXPRESSION_FUNCTIONS)
        .map(name => MBQL_CLAUSES[name])
        .map(func => ({
          type: "functions",
          name: func.displayName,
          text: func.displayName + "(",
          index: targetOffset,
          icon: "function",
          order: 1,
        })),
    );
    if (startRule === "aggregation") {
      suggestions.push(
        ...Array.from(AGGREGATION_FUNCTIONS)
          .map(name => MBQL_CLAUSES[name])
          .map(func => ({
            type: "aggregations",
            name: func.displayName,
            text: func.displayName + "(",
            index: targetOffset,
            icon: "function",
            order: 1,
          })),
      );
    }
  }

  if (_.last(matchPrefix) !== "]") {
    suggestions.push(
      ...query
        .dimensionOptions(() => true)
        .all()
        .map(dimension => ({
          type: "fields",
          name: getDimensionName(dimension),
          text: formatDimensionName(dimension) + " ",
          alternates: EDITOR_FK_SYMBOLS.symbols.map(symbol =>
            getDimensionName(dimension, symbol),
          ),
          index: targetOffset,
          icon: dimension.icon(),
          order: 2,
        })),
    );
    suggestions.push(
      ...query.table().segments.map(segment => ({
        type: "segments",
        name: segment.name,
        text: formatSegmentName(segment),
        index: targetOffset,
        icon: "segment",
        order: 3,
      })),
    );
    if (startRule === "aggregation") {
      suggestions.push(
        ...query.table().metrics.map(metric => ({
          type: "metrics",
          name: metric.name,
          text: formatMetricName(metric),
          index: targetOffset,
          icon: "insight",
          order: 4,
        })),
      );
    }
  }

  // throw away any suggestion that is not a suffix of the last partialToken.
  const partial = matchPrefix.toLowerCase();
  for (const suggestion of suggestions) {
    suggestion: for (const text of [
      suggestion.name,
      suggestion.text,
      ...(suggestion.alternates || []),
    ]) {
      const lower = (text || "").toLowerCase();
      if (lower.startsWith(partial)) {
        const offset = partial[0] === "[" ? 1 : 0;
        suggestion.range = [0, partial.length - offset];
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
  suggestions = suggestions.filter(suggestion => suggestion.range);

  // deduplicate suggestions and sort by type then name
  return {
    suggestions: _.chain(suggestions)
      .uniq(suggestion => suggestion.text)
      .sortBy("text")
      .sortBy("order")
      .value(),
  };
}
