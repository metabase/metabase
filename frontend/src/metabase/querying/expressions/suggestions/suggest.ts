import {
  type CompletionSource,
  autocompletion,
} from "@codemirror/autocomplete";

import { isNotNull } from "metabase/utils/types";
import type * as Lib from "metabase-lib";
import type { Database } from "metabase-types/api";

export type SuggestOptions = {
  /**
   * False: the list opens with nothing highlighted, so that Enter on a plain
   * word does something else, like saving or sending a request to the AI.
   * Down highlights the first option. True by default.
   */
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
  /** Whether the text can be a request in words to the AI, from a new column. */
  textRequest?: TextRequestOption;
};

import { getTemplateFieldKind } from "../templates";

import { suggestAggregations } from "./aggregations";
import { suggestFields } from "./fields";
import { suggestFunctions } from "./functions";
import { suggestAllowedValues, suggestLiterals } from "./literals";
import { suggestMeasures } from "./measures";
import { suggestMetrics } from "./metrics";
import {
  isOnPlaceholder,
  openOnPlaceholders,
  placeholderNavigation,
  placeholders,
} from "./placeholders";
import { openWhenEmpty, suggestPopular } from "./popular";
import { preselectWhenPicking } from "./preselect";
import { suggestSegments } from "./segments";
import { suggestRelatedColumns, suggestRelatedFunctions } from "./semantic";
import { type TextRequestOption, quietOnTextRequest } from "./text-request";
import {
  type GetColumnValues,
  isOnColumnValue,
  suggestColumnValues,
} from "./values";

export function suggestions(options: SuggestOptions) {
  const popular = suggestPopular(options);
  const completion = autocompletion({
    closeOnBlur: false,
    // Where the user is clearly picking, preselectWhenPicking highlights the
    // first option anyway.
    selectOnOpen: options.highlightFirstSuggestion ?? true,
    activateOnTyping: true,
    activateOnTypingDelay: 0,
    override: [
      ...[
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
      ].map(quietOnTextRequest(options.textRequest)),
    ].filter(isNotNull),
  });
  return [
    completion,
    placeholders,
    openOnPlaceholders,
    placeholderNavigation(),
    preselectWhenPicking,
    popular != null ? openWhenEmpty() : [],
  ];
}

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
