import {
  type CompletionContext,
  type CompletionResult,
  autocompletion,
} from "@codemirror/autocomplete";
import { t } from "ttag";
import _ from "underscore";

import { isNotNull } from "metabase/lib/types";
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
import { TOKEN, tokenize } from "metabase-lib/v1/expressions/tokenizer";
import type {
  MBQLClauseFunctionConfig,
  Token,
} from "metabase-lib/v1/expressions/types";
import type Metadata from "metabase-lib/v1/metadata/Metadata";

type SuggestOptions = Omit<
  SuggestArgs,
  "source" | "targetOffset" | "getColumnIcon"
>;

// TODO: tests
// TODO: enable snippet support
// TODO: render better help texts
// TODO: shortcuts
// TODO: use namespaced suggestion for fk sparator (eg. products.|

export function suggestions(options: SuggestOptions) {
  return autocompletion({
    activateOnTyping: true,
    activateOnTypingDelay: 0,
    override: [
      suggestLiterals(),
      suggestFields(options),
      suggestMetrics(options),
      suggestSegments(options),
      suggestFunctions(options),
      suggestAggregations(options),
      suggestPopular(options),
    ].filter(isNotNull),
  });
}

function tokenAtPos(source: string, pos: number): TokenWithText | null {
  const { tokens } = tokenize(source);

  const idx = tokens.findIndex(token => token.start <= pos && token.end >= pos);
  if (idx === -1) {
    return null;
  }

  const token = tokens[idx];
  const prevToken = tokens[idx - 1];

  if (
    prevToken &&
    prevToken.type === TOKEN.String &&
    prevToken.end - prevToken.start === 1
  ) {
    // dangling single- or double-quote
    return null;
  }

  const text = source.slice(token.start, token.end);
  return { ...token, text };
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
      section: t`Columns`,
    };
  });

  if (!columns || columns.length === 0) {
    return null;
  }

  return function (context: CompletionContext): CompletionResult | null {
    const source = context.state.doc.toString();
    const token = tokenAtPos(source, context.pos);

    if (!token) {
      return null;
    }

    return {
      from: token.start,
      to: token.end,
      options: columns,
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
    .map(func => ({
      type: "function",
      label: suggestionText(func),
      displayLabel: func.displayName,
      detail:
        (func.name &&
          database &&
          getHelpText(func.name, database, reportTimezone)?.description) ??
        undefined,
    }));

  return function (context: CompletionContext) {
    const source = context.state.doc.toString();
    const token = tokenAtPos(source, context.pos);

    if (!token || !isIdentifier(token) || isFieldReference(token)) {
      return null;
    }

    return {
      from: token.start,
      to: token.end,
      options: functions,
    };
  };
}

function suggestAggregations({ startRule, query, metadata }: SuggestOptions) {
  if (startRule !== "aggregation") {
    return null;
  }

  const database = getDatabase(query, metadata);
  const aggregations = Array.from(AGGREGATION_FUNCTIONS)
    .map(name => MBQL_CLAUSES[name])
    .filter(clause => clause && database?.hasFeature(clause.requiresFeature))
    .map(func => ({
      type: "aggregation",
      label: suggestionText(func),
      displayLabel: func.displayName,
    }));

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
      options: aggregations,
    };
  };
}

function suggestPopular({
  startRule,
  query,
  reportTimezone,
  metadata,
}: SuggestOptions) {
  const database = getDatabase(query, metadata);

  let popular: string[] | null = null;
  let section = null;

  if (startRule === "expression") {
    popular = POPULAR_FUNCTIONS;
    section = t`Common functions`;
  }
  if (startRule === "boolean") {
    popular = POPULAR_FILTERS;
    section = t`Common functions`;
  }
  if (startRule === "aggregation") {
    popular = POPULAR_AGGREGATIONS;
    section = t`Common aggregations`;
  }

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
      section,
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
          section: t`Literals`,
        },
        {
          label: "False",
          type: "literal",
          section: t`Literals`,
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
    };
  });

  if (!segments) {
    return null;
  }

  return function (context: CompletionContext) {
    const source = context.state.doc.toString();
    const token = tokenAtPos(source, context.pos);

    if (!token || token.text.startsWith("[")) {
      // Cursor is inside a field reference tag
      return null;
    }

    return {
      from: context.pos,
      options: segments,
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
      section: t`Metrics`,
    };
  });

  if (startRule !== "aggregation" || metrics.length === 0) {
    return null;
  }

  return function (context: CompletionContext) {
    const source = context.state.doc.toString();
    const token = tokenAtPos(source, context.pos);

    if (!token || !isIdentifier(token) || isFieldReference(token)) {
      // Cursor is inside a field reference tag
      return null;
    }

    return {
      from: context.pos,
      options: metrics,
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

type TokenWithText = Token & { text: string };

function isIdentifier(token: TokenWithText | null) {
  return token != null && token.type === TOKEN.Identifier;
}

function isFieldReference(token: TokenWithText | null) {
  return token != null && isIdentifier(token) && token.text.startsWith("[");
}
