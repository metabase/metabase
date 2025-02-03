import {
  type CompletionContext,
  autocompletion,
  snippetCompletion,
} from "@codemirror/autocomplete";
import Fuse from "fuse.js";
import _ from "underscore";

import { getColumnIcon } from "metabase/common/utils/columns";
import { isNotNull } from "metabase/lib/types";
import type { IconName } from "metabase/ui";
import * as Lib from "metabase-lib";
import { formatIdentifier } from "metabase-lib/v1/expressions";
import {
  AGGREGATION_FUNCTIONS,
  EXPRESSION_FUNCTIONS,
  MBQL_CLAUSES,
  POPULAR_AGGREGATIONS,
  POPULAR_FILTERS,
  POPULAR_FUNCTIONS,
} from "metabase-lib/v1/expressions/config";
import { getHelpText } from "metabase-lib/v1/expressions/helper-text-strings";
import type { SuggestArgs } from "metabase-lib/v1/expressions/suggest";
import type {
  HelpText,
  MBQLClauseFunctionConfig,
} from "metabase-lib/v1/expressions/types";
import type Database from "metabase-lib/v1/metadata/Database";
import type Metadata from "metabase-lib/v1/metadata/Metadata";

import type { Completion, CompletionResult } from "./types";
import { isFieldReference, isIdentifier, tokenAtPos } from "./util";

export type Shortcut = {
  name: string;
  icon: IconName;
  action: () => void;
};

type SuggestOptions = Omit<
  SuggestArgs,
  "source" | "targetOffset" | "getColumnIcon"
> & {
  shortcuts?: Shortcut[];
};

// TODO: tests
// TODO: use namespaced suggestion for fk sparator (eg. products.|

export function suggestions(options: SuggestOptions) {
  return autocompletion({
    closeOnBlur: false,
    activateOnTyping: true,
    activateOnTypingDelay: 0,
    override: [
      suggestLiterals(),
      suggestFunctions(options),
      suggestAggregations(options),
      suggestFields(options),
      suggestMetrics(options),
      suggestSegments(options),
      suggestPopular(options),
      suggestShortcuts(options),
    ].filter(isNotNull),
  });
}

function suggestFields({ query, stageIndex, expressionIndex }: SuggestOptions) {
  const columns = Lib.expressionableColumns(
    query,
    stageIndex,
    expressionIndex,
  )?.map(column => {
    const displayInfo = Lib.displayInfo(query, stageIndex, column);
    return {
      type: "field",
      label: formatIdentifier(displayInfo.longDisplayName),
      displayLabel: displayInfo.longDisplayName,
      icon: getColumnIcon(column),
    };
  });

  if (!columns || columns.length === 0) {
    return null;
  }

  const matcher = fuzzyMatcher(columns);

  return function (context: CompletionContext): CompletionResult | null {
    const source = context.state.doc.toString();
    const token = tokenAtPos(source, context.pos);

    if (!token) {
      return null;
    }

    const word = token.text.replace(/^\[/, "").replace(/\]$/, "");
    if (word === "") {
      return {
        from: token.start,
        to: token.end,
        options: columns,
        filter: false,
      };
    }

    const options = matcher(word);

    return {
      from: token.start,
      to: token.end,
      options,
      filter: false,
    };
  };
}

function suggestFunctions({
  startRule,
  query,
  metadata,
  reportTimezone,
}: SuggestOptions) {
  if (startRule !== "expression" && startRule !== "boolean") {
    return null;
  }

  const database = getDatabase(query, metadata);
  const ALIASES = ["case"];
  const functions = [...EXPRESSION_FUNCTIONS, ...ALIASES]
    .map(name => MBQL_CLAUSES[name])
    .filter(clause => clause && database?.hasFeature(clause.requiresFeature))
    .filter(function disableOffsetInFilterExpressions(clause) {
      const isOffset = clause.name === "offset";
      const isFilterExpression = startRule === "boolean";
      const isOffsetInFilterExpression = isOffset && isFilterExpression;
      return !isOffsetInFilterExpression;
    })
    .map(func =>
      expressionClauseCompletion(func, {
        type: "function",
        database,
        reportTimezone,
      }),
    );

  const matcher = fuzzyMatcher(functions);

  return function (context: CompletionContext) {
    const source = context.state.doc.toString();
    const token = tokenAtPos(source, context.pos);

    if (!token || !isIdentifier(token) || isFieldReference(token)) {
      return null;
    }

    return {
      from: token.start,
      to: token.end,
      options: matcher(token.text),
      filter: false,
    };
  };
}

function suggestAggregations({
  startRule,
  query,
  metadata,
  reportTimezone,
}: SuggestOptions) {
  if (startRule !== "aggregation") {
    return null;
  }

  const database = getDatabase(query, metadata);
  const aggregations = Array.from(AGGREGATION_FUNCTIONS)
    .map(name => MBQL_CLAUSES[name])
    .filter(clause => clause && database?.hasFeature(clause.requiresFeature))
    .map(agg =>
      expressionClauseCompletion(agg, {
        type: "aggregation",
        database,
        reportTimezone,
      }),
    );

  const matcher = fuzzyMatcher(aggregations);

  return function (context: CompletionContext) {
    const source = context.state.doc.toString();
    const token = tokenAtPos(source, context.pos);
    if (!token || !isIdentifier(token) || isFieldReference(token)) {
      // Cursor is inside a field reference tag
      return null;
    }
    return {
      from: token.start,
      to: token.end,
      options: matcher(token.text),
      filter: false,
    };
  };
}

function getPopular(startRule: string) {
  if (startRule === "expression") {
    return POPULAR_FUNCTIONS;
  }
  if (startRule === "boolean") {
    return POPULAR_FILTERS;
  }
  if (startRule === "aggregation") {
    return POPULAR_AGGREGATIONS;
  }
  return null;
}

function suggestPopular({
  startRule,
  query,
  reportTimezone,
  metadata,
}: SuggestOptions) {
  const database = getDatabase(query, metadata);

  const popular = getPopular(startRule);
  if (!popular) {
    return null;
  }

  const clauses = popular
    .map(name => MBQL_CLAUSES[name])
    .filter(isNotNull)
    .filter(clause => !database || database?.hasFeature(clause.requiresFeature))
    .map(clause => ({
      type: "function",
      label: suggestionText(clause),
      displayLabel: clause.displayName,
      detail:
        (clause.name &&
          database &&
          getHelpText(clause.name, database, reportTimezone)?.description) ??
        undefined,
      icon: "function",
    }));

  return function (context: CompletionContext) {
    const source = context.state.doc.toString();
    if (source !== "") {
      // we only want to show popular functions and suggestions when
      // the source is empty
      return null;
    }
    return {
      from: context.pos,
      options: clauses,
    };
  };
}

function suggestLiterals() {
  return function (context: CompletionContext) {
    const source = context.state.doc.toString();
    const token = tokenAtPos(source, context.pos);

    if (!token || !isIdentifier(token) || isFieldReference(token)) {
      // Cursor is inside a field reference tag
      return null;
    }

    return {
      from: token.start,
      to: token.end,
      options: [
        {
          label: "True",
          type: "literal",
          icon: "boolean",
        },
        {
          label: "False",
          type: "literal",
          icon: "boolean",
        },
      ],
    };
  };
}

function suggestSegments({ query, stageIndex }: SuggestOptions) {
  const segments = Lib.availableSegments(query, stageIndex)?.map(segment => {
    const displayInfo = Lib.displayInfo(query, stageIndex, segment);
    return {
      type: "segment",
      displayLabel: displayInfo.longDisplayName,
      label: formatIdentifier(displayInfo.longDisplayName),
      icon: "segment" as const,
    };
  });

  if (!segments) {
    return null;
  }

  const matcher = fuzzyMatcher(segments);

  return function (context: CompletionContext) {
    const source = context.state.doc.toString();
    const token = tokenAtPos(source, context.pos);

    if (!token || token.text.startsWith("[")) {
      // Cursor is inside a field reference tag
      return null;
    }

    return {
      from: token.start,
      to: token.end,
      options: matcher(token.text),
      filter: false,
    };
  };
}

function suggestMetrics({ startRule, query, stageIndex }: SuggestOptions) {
  const metrics = Lib.availableMetrics(query, stageIndex)?.map(metric => {
    const displayInfo = Lib.displayInfo(query, stageIndex, metric);
    return {
      type: "metric",
      displayLabel: displayInfo.longDisplayName,
      label: formatIdentifier(displayInfo.longDisplayName),
      icon: "metric" as const,
    };
  });

  if (startRule !== "aggregation" || metrics.length === 0) {
    return null;
  }

  const matcher = fuzzyMatcher(metrics);

  return function (context: CompletionContext) {
    const source = context.state.doc.toString();
    const token = tokenAtPos(source, context.pos);

    if (!token) {
      return null;
    }

    return {
      from: token.start,
      to: token.end,
      options: matcher(token.text),
      filter: false,
    };
  };
}

const suggestionText = (func: MBQLClauseFunctionConfig) => {
  const { displayName, args } = func;
  const suffix = args.length > 0 ? "(" : " ";
  return displayName + suffix;
};

function getDatabase(query: Lib.Query, metadata: Metadata) {
  const databaseId = Lib.databaseID(query);
  return metadata.database(databaseId);
}

function getSnippet(helpText: HelpText) {
  const args = helpText.args
    ?.filter(arg => arg.name !== "…")
    ?.map(arg => "${" + arg.name + "}")
    .join(", ");
  return `${helpText.structure}(${args})`;
}

function expressionClauseCompletion(
  clause: MBQLClauseFunctionConfig,
  {
    type,
    database,
    reportTimezone,
    matches,
  }: {
    type: string;
    database: Database | null;
    reportTimezone?: string;
    matches?: [number, number][];
  },
): Completion {
  const helpText =
    clause.name &&
    database &&
    getHelpText(clause.name, database, reportTimezone);

  if (helpText) {
    const completion = snippetCompletion(getSnippet(helpText), {
      type,
      label: clause.displayName,
      displayLabel: clause.displayName,
      detail: helpText.description,
    });
    return { ...completion, icon: "function", matches };
  }

  return {
    type,
    label: suggestionText(clause),
    displayLabel: clause.displayName,
    icon: "function",
    matches,
  };
}

function suggestShortcuts(options: SuggestOptions) {
  const { shortcuts = [] } = options;

  const completions: Completion[] = shortcuts.map(shortcut => ({
    label: shortcut.name,
    icon: shortcut.icon,
    apply: shortcut.action,
    section: "shortcuts",
  }));

  if (completions.length === 0) {
    return null;
  }

  return function (context: CompletionContext): CompletionResult | null {
    if (context.state.doc.toString() !== "") {
      return null;
    }

    return {
      from: context.pos,
      options: completions,
    };
  };
}

function fuzzyMatcher(options: Completion[]) {
  const keys = ["displayLabel"];

  const fuse = new Fuse(options, {
    keys,
    includeScore: true,
    includeMatches: true,
  });

  return function (word: string) {
    return fuse
      .search(word)
      .filter(result => (result.score ?? 0) < 0.5)
      .sort((a, b) => (a.score ?? 0) - (b.score ?? 0))
      .map(result => ({
        ...result.item,
        matches: result.matches?.flatMap(match => match.indices) ?? [],
      }));
  };
}
