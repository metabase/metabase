import { autocompletion } from "@codemirror/autocomplete";

import { isNotNull } from "metabase/lib/types";
import type * as Lib from "metabase-lib";
import type Metadata from "metabase-lib/v1/metadata/Metadata";

export type SuggestOptions = {
  query: Lib.Query;
  stageIndex: number;
  metadata: Metadata;
  reportTimezone?: string;
  expressionMode: Lib.ExpressionMode;
  expressionIndex: number | undefined;
};

import { suggestAggregations } from "./aggregations";
import { suggestFields } from "./fields";
import { suggestFunctions } from "./functions";
import { suggestLiterals } from "./literals";
import { suggestMetrics } from "./metrics";
import { suggestSegments } from "./segments";

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
    ].filter(isNotNull),
  });
}
