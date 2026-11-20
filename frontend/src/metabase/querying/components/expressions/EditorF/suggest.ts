/**
 * Version F: a copy of `metabase/querying/expressions/suggestions/suggest.ts`
 * with a permanent "Open the docs" row at the end of the list, and without the
 * quiet on a request in words (requests have their own AI mode in B).
 */
import {
  type CompletionContext,
  type CompletionSource,
  autocompletion,
  closeCompletion,
  completionStatus,
  currentCompletions,
} from "@codemirror/autocomplete";
import { EditorView } from "@codemirror/view";
import { t } from "ttag";

import { suggestAggregations } from "metabase/querying/expressions/suggestions/aggregations";
import { suggestFields } from "metabase/querying/expressions/suggestions/fields";
import { suggestFunctions } from "metabase/querying/expressions/suggestions/functions";
import {
  suggestAllowedValues,
  suggestLiterals,
} from "metabase/querying/expressions/suggestions/literals";
import { suggestMeasures } from "metabase/querying/expressions/suggestions/measures";
import { suggestMetrics } from "metabase/querying/expressions/suggestions/metrics";
import {
  isOnPlaceholder,
  openOnPlaceholders,
  placeholderNavigation,
  placeholders,
} from "metabase/querying/expressions/suggestions/placeholders";
import {
  openWhenEmpty,
  suggestPopular,
} from "metabase/querying/expressions/suggestions/popular";
import { preselectWhenPicking } from "metabase/querying/expressions/suggestions/preselect";
import { suggestSegments } from "metabase/querying/expressions/suggestions/segments";
import {
  suggestRelatedColumns,
  suggestRelatedFunctions,
} from "metabase/querying/expressions/suggestions/semantic";
import type {
  CompletionResult,
  ExpressionSuggestion,
} from "metabase/querying/expressions/suggestions/types";
import {
  type GetColumnValues,
  isOnColumnValue,
  suggestColumnValues,
} from "metabase/querying/expressions/suggestions/values";
import { getTemplateFieldKind } from "metabase/querying/expressions/templates";
import { isNotNull } from "metabase/utils/types";
import type * as Lib from "metabase-lib";
import type { Database } from "metabase-types/api";

export type SuggestOptionsB = {
  /** See `SuggestOptions` in the shared suggest.ts. */
  highlightFirstSuggestion?: boolean;
  query: Lib.Query;
  stageIndex: number;
  database: Pick<Database, "features"> | undefined;
  expressionMode: Lib.ExpressionMode;
  availableColumns: Lib.ColumnMetadata[];
  availableMetrics?: Lib.MetricMetadata[];
  /** False: columns only after "[", not for a bare word. */
  columnsOutsideBrackets?: boolean;
  /** Display names of the functions to suggest while the expression is empty. */
  popularFunctions?: string[];
  /** Gives the values of a column, for a value that is compared to it. */
  getColumnValues?: GetColumnValues;
  /** Opens the docs side panel, from the last row of the list. */
  openDocs: () => void;
};

/** The `type` of the "Open the docs" row, which the list draws on its own. */
export const DOCS_SUGGESTION_TYPE = "docs";

export function suggestionsB(options: SuggestOptionsB) {
  const popular = suggestPopular(options);
  const completion = autocompletion({
    closeOnBlur: false,
    selectOnOpen: options.highlightFirstSuggestion ?? true,
    activateOnTyping: true,
    activateOnTypingDelay: 0,
    override: [
      quietOnTemplateBlanks(suggestColumnValues(options)),
      ...[
        quietOnTemplateBlanks(popular),
        quietOnTemplateBlanks(suggestLiterals()),
        // Offers the allowed values on a placeholder too.
        suggestAllowedValues(),
        quietOnTemplateBlanks(suggestFunctions(options)),
        quietOnTemplateBlanks(suggestAggregations(options)),
        // Offers every column on a template's column blank.
        suggestFields(options),
        quietOnTemplateBlanks(suggestMetrics(options)),
        quietOnTemplateBlanks(suggestMeasures(options)),
        quietOnTemplateBlanks(suggestSegments(options)),
        // Last, so that their options come after the text matches.
        quietOnTemplateBlanks(suggestRelatedFunctions(options)),
        quietOnTemplateBlanks(suggestRelatedColumns(options)),
      ].map(quietOnColumnValues),
      suggestDocs(options.openDocs),
    ].filter(isNotNull),
  });
  return [
    completion,
    placeholders,
    openOnPlaceholders,
    placeholderNavigation(),
    preselectWhenPicking,
    closeWhenOnlyDocs,
    popular != null ? openWhenEmpty() : [],
  ];
}

/**
 * The "Open the docs" row, after every other option. Its range is empty, so
 * it's sorted like an option that matches nothing typed, and the low boost
 * puts it after the others.
 */
function suggestDocs(openDocs: () => void): CompletionSource {
  const option: ExpressionSuggestion = {
    type: DOCS_SUGGESTION_TYPE,
    label: t`Open the docs`,
    icon: "book_open",
    boost: -99,
    apply: (view) => {
      closeCompletion(view);
      openDocs();
    },
  };
  return (context: CompletionContext): CompletionResult => ({
    from: context.pos,
    to: context.pos,
    options: [option],
  });
}

function isDocsOnly(options: readonly { type?: string }[]) {
  return options.every((option) => option.type === DOCS_SUGGESTION_TYPE);
}

/** The docs row shows only below suggestions, never on its own. */
const closeWhenOnlyDocs = /* #__PURE__ */ EditorView.updateListener.of(
  (update) => {
    const { state, view } = update;
    if (
      completionStatus(state) === "active" &&
      isDocsOnly(currentCompletions(state))
    ) {
      // A listener can't dispatch while the update is running.
      setTimeout(() => {
        if (
          completionStatus(view.state) === "active" &&
          isDocsOnly(currentCompletions(view.state))
        ) {
          closeCompletion(view);
        }
      });
    }
  },
);

/** On a template's blank or a placeholder, only the column list may show. */
function quietOnTemplateBlanks(
  source: CompletionSource | null,
): CompletionSource | null {
  if (source === null) {
    return null;
  }
  return (context) =>
    getTemplateFieldKind(context.state) === null &&
    !isOnPlaceholder(context.state)
      ? source(context)
      : null;
}

/** In a text value that is compared to a column, only its values show. */
function quietOnColumnValues(
  source: CompletionSource | null,
): CompletionSource | null {
  if (source === null) {
    return null;
  }
  return (context) => (isOnColumnValue(context.state) ? null : source(context));
}
