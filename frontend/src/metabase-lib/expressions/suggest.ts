import _ from "underscore";

import {
  enclosingFunction,
  partialMatch,
} from "metabase-lib/expressions/completer";
import {
  AGGREGATION_FUNCTIONS,
  EDITOR_FK_SYMBOLS,
  EXPRESSION_FUNCTIONS,
  getMBQLName,
  MBQL_CLAUSES as MBQL_CLAUSES_CONFIG,
} from "metabase-lib/expressions/config";
import {
  formatDimensionName,
  formatMetricName,
  formatSegmentName,
  getDimensionName,
} from "metabase-lib/expressions";
import {
  HelpText,
  MBQLClauseFunctionConfig,
  MBQLClauseMap,
} from "metabase-lib/expressions/types";
import StructuredQuery from "metabase-lib/queries/StructuredQuery";
import { getHelpText } from "metabase-lib/expressions/helper-text-strings";

const MBQL_CLAUSES = MBQL_CLAUSES_CONFIG as MBQLClauseMap;

export type Suggestion = {
  type: string;
  name: string;
  text: string;
  alternates?: string[];
  index: number;
  icon: string | null | undefined;
  order: number;
  range?: [number, number];
};

const suggestionText = (func: MBQLClauseFunctionConfig) => {
  const { displayName, args } = func;
  const suffix = args.length > 0 ? "(" : " ";
  return displayName + suffix;
};

type SuggestArgs = {
  source: string;
  query: StructuredQuery;
  reportTimezone?: string;
  startRule: string;
  targetOffset?: number;
};

export function suggest({
  source,
  query,
  reportTimezone,
  startRule,
  targetOffset = source.length,
}: SuggestArgs): {
  helpText?: HelpText;
  suggestions?: Suggestion[];
} {
  let suggestions: Suggestion[] = [];

  const partialSource = source.slice(0, targetOffset);
  const matchPrefix = partialMatch(partialSource);

  if (!matchPrefix || _.last(matchPrefix) === "]") {
    // no keystroke to match? show help text for the enclosing function
    const functionDisplayName = enclosingFunction(partialSource);
    if (functionDisplayName) {
      const name = getMBQLName(functionDisplayName);
      const database = query.database();

      if (name && database) {
        const helpText = getHelpText(name, database, reportTimezone);
        if (helpText) {
          return { suggestions, helpText };
        }
      }
    }
    return { suggestions };
  }

  suggestions.push(
    {
      type: "literal",
      name: "True",
      text: "True",
      index: targetOffset,
      icon: "io",
      order: 1,
    },
    {
      type: "literal",
      name: "False",
      text: "False",
      index: targetOffset,
      icon: "io",
      order: 1,
    },
  );

  const database = query.database();
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
        .filter(
          clause => clause && database?.hasFeature(clause.requiresFeature),
        )
        .map(func => ({
          type: "functions",
          name: func.displayName,
          text: suggestionText(func),
          index: targetOffset,
          icon: "function",
          order: 1,
        })),
    );
    if (startRule === "aggregation") {
      suggestions.push(
        ...Array.from(AGGREGATION_FUNCTIONS)
          .map(name => MBQL_CLAUSES[name])
          .filter(
            clause => clause && database?.hasFeature(clause.requiresFeature),
          )
          .map(func => ({
            type: "aggregations",
            name: func.displayName,
            text: suggestionText(func),
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
          dimension,
        })),
    );

    const segments = query.table()?.segments;
    if (segments) {
      suggestions.push(
        ...segments.map(segment => ({
          type: "segments",
          name: segment.name,
          text: formatSegmentName(segment),
          index: targetOffset,
          icon: "segment",
          order: 3,
        })),
      );
    }

    if (startRule === "aggregation") {
      const metrics = query.table()?.metrics;
      if (metrics) {
        suggestions.push(
          ...metrics.map(metric => ({
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
  suggestions = _.chain(suggestions)
    .uniq(suggestion => suggestion.text)
    .sortBy("text")
    .sortBy("order")
    .value();

  // the only suggested function equals the prefix match?
  if (suggestions.length === 1 && matchPrefix) {
    const { icon } = suggestions[0];
    if (icon === "function") {
      const name = getMBQLName(matchPrefix);
      const database = query.database();

      if (name && database) {
        const helpText = getHelpText(name, database, reportTimezone);

        if (helpText) {
          return { helpText };
        }
      }
    }
  }

  return { suggestions };
}
