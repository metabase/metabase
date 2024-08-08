import { t } from "ttag";
import _ from "underscore";

import * as Lib from "metabase-lib";
import {
  enclosingFunction,
  partialMatch,
} from "metabase-lib/v1/expressions/completer";
import {
  AGGREGATION_FUNCTIONS,
  EDITOR_FK_SYMBOLS,
  EXPRESSION_FUNCTIONS,
  getMBQLName,
  MBQL_CLAUSES,
  POPULAR_AGGREGATIONS,
  POPULAR_FILTERS,
  POPULAR_FUNCTIONS,
} from "metabase-lib/v1/expressions/config";
import { getHelpText } from "metabase-lib/v1/expressions/helper-text-strings";
import type {
  HelpText,
  MBQLClauseFunctionConfig,
} from "metabase-lib/v1/expressions/types";
import type Metadata from "metabase-lib/v1/metadata/Metadata";

import { formatIdentifier, getDisplayNameWithSeparator } from "./";

export type Suggestion = {
  type: string;
  name: string;
  text: string;
  alternates?: string[];
  index: number;
  icon: string | null | undefined;
  order: number;
  range?: [number, number];
  column?: Lib.ColumnMetadata;
  helpText?: HelpText;
  group?: GroupName;
};

const suggestionText = (func: MBQLClauseFunctionConfig) => {
  const { displayName, args } = func;
  const suffix = args.length > 0 ? "(" : " ";
  return displayName + suffix;
};

export const GROUPS = {
  popularExpressions: {
    displayName: t`Common functions`,
  },
  popularAggregations: {
    displayName: t`Common aggregations`,
  },
  shortcuts: {
    displayName: t`Shortcuts`,
  },
} as const;

export type GroupName = keyof typeof GROUPS;

export type SuggestArgs = {
  source: string;
  query: Lib.Query;
  stageIndex: number;
  metadata: Metadata;
  reportTimezone?: string;
  startRule: string;
  targetOffset?: number;
  expressionIndex: number | undefined;
  getColumnIcon: (column: Lib.ColumnMetadata) => string;
};

export function suggest({
  source,
  query,
  stageIndex,
  getColumnIcon,
  metadata,
  reportTimezone,
  startRule,
  expressionIndex,
  targetOffset = source.length,
}: SuggestArgs): {
  helpText?: HelpText;
  suggestions?: Suggestion[];
} {
  let suggestions: Suggestion[] = [];

  const partialSource = source.slice(0, targetOffset);
  const matchPrefix = partialMatch(partialSource);
  const database = getDatabase(query, metadata);

  if (!matchPrefix || _.last(matchPrefix) === "]") {
    // no keystroke to match? show help text for the enclosing function
    const functionDisplayName = enclosingFunction(partialSource);
    if (functionDisplayName) {
      const name = getMBQLName(functionDisplayName);

      if (name && database) {
        const helpText = getHelpText(name, database, reportTimezone);
        if (helpText) {
          const clause = MBQL_CLAUSES[helpText?.name];
          const isSupported =
            !clause || database?.hasFeature(clause.requiresFeature);
          if (isSupported) {
            return { suggestions, helpText };
          }
        }
      }
    }

    if (source === "") {
      let popular: string[] = [];
      if (startRule === "expression") {
        popular = POPULAR_FUNCTIONS;
      }
      if (startRule === "boolean") {
        popular = POPULAR_FILTERS;
      }
      if (startRule === "aggregation") {
        popular = POPULAR_AGGREGATIONS;
      }

      suggestions.push(
        ...popular
          .map((name: string): Suggestion | null => {
            const clause = MBQL_CLAUSES[name];
            if (!clause) {
              return null;
            }

            const isSupported =
              !database || database?.hasFeature(clause.requiresFeature);

            if (!isSupported) {
              return null;
            }

            return {
              type: "functions",
              name: clause.displayName,
              text: suggestionText(clause),
              index: targetOffset,
              icon: "function",
              order: 1,
              group:
                startRule === "aggregation"
                  ? "popularAggregations"
                  : "popularExpressions",
              helpText: database
                ? getHelpText(name, database, reportTimezone)
                : undefined,
            };
          })
          .filter((suggestion): suggestion is Suggestion => Boolean(suggestion))
          .slice(0, 5),
      );
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
        .filter(function disableOffsetInFilterExpressions(clause) {
          const isOffset = clause.name === "offset";
          const isFilterExpression = startRule === "boolean";
          const isOffsetInFilterExpression = isOffset && isFilterExpression;
          return !isOffsetInFilterExpression;
        })
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
    suggestions = _.sortBy(suggestions, "text");
  }

  if (_.last(matchPrefix) !== "]") {
    suggestions.push(
      ...Lib.expressionableColumns(query, stageIndex, expressionIndex).map(
        column => {
          const displayInfo = Lib.displayInfo(query, stageIndex, column);

          return {
            type: "fields",
            name: displayInfo.longDisplayName,
            text: formatIdentifier(displayInfo.longDisplayName) + " ",
            alternates: EDITOR_FK_SYMBOLS.symbols.map(symbol =>
              getDisplayNameWithSeparator(displayInfo.longDisplayName, symbol),
            ),
            index: targetOffset,
            icon: getColumnIcon(column),
            order: 2,
            column,
            ...column,
          };
        },
      ),
    );

    const segments = Lib.availableSegments(query, stageIndex);

    if (segments) {
      suggestions.push(
        ...segments.map(segment => {
          const displayInfo = Lib.displayInfo(query, stageIndex, segment);

          return {
            type: "segments",
            name: displayInfo.longDisplayName,
            text: formatIdentifier(displayInfo.longDisplayName),
            index: targetOffset,
            icon: "segment",
            order: 3,
          };
        }),
      );
    }

    if (startRule === "aggregation") {
      const metrics = Lib.availableLegacyMetrics(query, stageIndex);

      if (metrics) {
        suggestions.push(
          ...metrics.map(metric => {
            const displayInfo = Lib.displayInfo(query, stageIndex, metric);

            return {
              type: "metrics",
              name: displayInfo.longDisplayName,
              text: formatIdentifier(displayInfo.longDisplayName),
              index: targetOffset,
              icon: "insight",
              order: 4,
            };
          }),
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

  // deduplicate suggestions
  suggestions = _.chain(suggestions)
    .uniq(suggestion => suggestion.text)
    .value();

  // the only suggested function equals the prefix match?
  if (suggestions.length === 1 && matchPrefix) {
    const { icon } = suggestions[0];
    if (icon === "function") {
      const name = getMBQLName(matchPrefix);

      if (name && database) {
        const helpText = getHelpText(name, database, reportTimezone);

        if (helpText) {
          return { helpText };
        }
      }
    }
  }

  if (database) {
    suggestions = suggestions.map(suggestion => {
      const name = getMBQLName(suggestion.name);
      if (!name) {
        return suggestion;
      }
      return {
        ...suggestion,
        helpText: getHelpText(name, database, reportTimezone),
      };
    });
  }

  return { suggestions };
}

function getDatabase(query: Lib.Query, metadata: Metadata) {
  const databaseId = Lib.databaseID(query);

  return metadata.database(databaseId);
}
