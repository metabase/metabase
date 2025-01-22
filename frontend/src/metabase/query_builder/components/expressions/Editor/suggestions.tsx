import {
  type Completion,
  type CompletionContext,
  type CompletionResult,
  autocompletion,
  snippetCompletion,
} from "@codemirror/autocomplete";
import { renderToString } from "react-dom/server";
import _ from "underscore";

import { getColumnIcon } from "metabase/common/utils/columns";
import { isNotNull } from "metabase/lib/types";
import { Icon, type IconName } from "metabase/ui";
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
  HelpText,
  MBQLClauseFunctionConfig,
  Token,
} from "metabase-lib/v1/expressions/types";
import type Database from "metabase-lib/v1/metadata/Database";
import type Metadata from "metabase-lib/v1/metadata/Metadata";

type SuggestOptions = Omit<
  SuggestArgs,
  "source" | "targetOffset" | "getColumnIcon"
>;

// TODO: tests
// TODO: render better help texts
// TODO: shortcuts
// TODO: use namespaced suggestion for fk sparator (eg. products.|

export function suggestions(options: SuggestOptions) {
  return autocompletion({
    closeOnBlur: false,
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
    addToOptions: [
      {
        position: 25,
        render(completion: Completion & { icon?: IconName }) {
          if (completion.type !== "field" || !completion.icon) {
            return null;
          }
          const span = document.createElement("span");
          span.className = "cm-columnIcon";
          span.innerHTML = renderToString(<Icon name={completion.icon} />);
          return span;
        },
      },
    ],
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
      icon: getColumnIcon(column),
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
    .map(func =>
      expressionClauseCompletion(func, {
        type: "function",
        database,
        reportTimezone,
      }),
    );

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
        },
        {
          label: "False",
          type: "literal",
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

function getSnippet(helpText: HelpText) {
  const args = helpText.args
    ?.map(arg => "${" + arg.name.replace("…", "") + "}")
    .join(", ");
  return `${helpText.name}(${args})`;
}

function expressionClauseCompletion(
  clause: MBQLClauseFunctionConfig,
  {
    type,
    database,
    reportTimezone,
  }: {
    type: string;
    database: Database | null;
    reportTimezone?: string;
  },
): Completion {
  const helpText =
    clause.name &&
    database &&
    getHelpText(clause.name, database, reportTimezone);

  if (helpText) {
    return snippetCompletion(getSnippet(helpText), {
      type,
      label: clause.displayName,
      displayLabel: clause.displayName,
      detail: helpText.description,
    });
  }

  return {
    type,
    label: suggestionText(clause),
    displayLabel: clause.displayName,
  };
}

type TokenWithText = Token & { text: string };

function isIdentifier(token: TokenWithText | null) {
  return token != null && token.type === TOKEN.Identifier;
}

function isFieldReference(token: TokenWithText | null) {
  return token != null && isIdentifier(token) && token.text.startsWith("[");
}
