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
};

import { getTemplateFieldKind } from "../templates";

import { suggestAggregations } from "./aggregations";
import { suggestFields } from "./fields";
import { suggestFunctions } from "./functions";
import { suggestLiterals } from "./literals";
import { suggestMeasures } from "./measures";
import { suggestMetrics } from "./metrics";
import { suggestSegments } from "./segments";

export function suggestions(options: SuggestOptions) {
  return autocompletion({
    closeOnBlur: false,
    activateOnTyping: true,
    activateOnTypingDelay: 0,
    override: [
      quietOnTemplateBlanks(suggestLiterals()),
      quietOnTemplateBlanks(suggestFunctions(options)),
      quietOnTemplateBlanks(suggestAggregations(options)),
      suggestFields(options),
      quietOnTemplateBlanks(suggestMetrics(options)),
      quietOnTemplateBlanks(suggestMeasures(options)),
      quietOnTemplateBlanks(suggestSegments(options)),
    ].filter(isNotNull),
  });
}

function quietOnTemplateBlanks(source: CompletionSource | null) {
  if (source === null) {
    return null;
  }

  const guarded: CompletionSource = (context) =>
    getTemplateFieldKind(context.state) === null ? source(context) : null;
  return guarded;
}
