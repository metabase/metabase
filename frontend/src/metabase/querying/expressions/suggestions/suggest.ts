import {
  type CompletionSource,
  autocompletion,
} from "@codemirror/autocomplete";

import { isNotNull } from "metabase/utils/types";
import type * as Lib from "metabase-lib";
import type { Database } from "metabase-types/api";

export type SuggestOptions = {
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
};

import { getTemplateFieldKind } from "../templates";

import { suggestAggregations } from "./aggregations";
import { suggestFields } from "./fields";
import { suggestFunctions } from "./functions";
import { suggestLiterals } from "./literals";
import { suggestMeasures } from "./measures";
import { suggestMetrics } from "./metrics";
import {
  isOnPlaceholder,
  openOnPlaceholders,
  placeholders,
} from "./placeholders";
import { openWhenEmpty, suggestPopular } from "./popular";
import { suggestSegments } from "./segments";
import { suggestRelatedColumns, suggestRelatedFunctions } from "./semantic";

export function suggestions(options: SuggestOptions) {
  const popular = suggestPopular(options);
  const completion = autocompletion({
    closeOnBlur: false,
    activateOnTyping: true,
    activateOnTypingDelay: 0,
    override: [
      quietOnTemplateBlanks(popular),
      quietOnTemplateBlanks(suggestLiterals()),
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
    ].filter(isNotNull),
  });
  return [
    completion,
    placeholders,
    openOnPlaceholders,
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
