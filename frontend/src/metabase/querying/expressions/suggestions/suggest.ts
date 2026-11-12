import { autocompletion } from "@codemirror/autocomplete";

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

import { suggestAggregations } from "./aggregations";
import { suggestFields } from "./fields";
import { suggestFunctions } from "./functions";
import { suggestLiterals } from "./literals";
import { suggestMeasures } from "./measures";
import { suggestMetrics } from "./metrics";
import { placeholders } from "./placeholders";
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
      popular,
      suggestLiterals(),
      suggestFunctions(options),
      suggestAggregations(options),
      suggestFields(options),
      suggestMetrics(options),
      suggestMeasures(options),
      suggestSegments(options),
      // Last, so that their options come after the text matches.
      suggestRelatedFunctions(options),
      suggestRelatedColumns(options),
    ].filter(isNotNull),
  });
  return [completion, placeholders, popular != null ? openWhenEmpty() : []];
}
