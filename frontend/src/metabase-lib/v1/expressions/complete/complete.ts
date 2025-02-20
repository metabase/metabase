import { autocompletion } from "@codemirror/autocomplete";

import { isNotNull } from "metabase/lib/types";
import type { SuggestArgs } from "metabase-lib/v1/expressions/suggest";

export type SuggestOptions = Omit<
  SuggestArgs,
  "source" | "targetOffset" | "getColumnIcon"
> & {
  shortcuts?: Shortcut[];
};

import { suggestAggregations } from "./aggregations";
import { suggestFields } from "./fields";
import { suggestFunctions } from "./functions";
import { suggestLiterals } from "./literals";
import { suggestMetrics } from "./metrics";
import { suggestSegments } from "./segments";
import { suggestShortcuts } from "./shortcuts";
import type { Shortcut } from "./types";

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
      suggestShortcuts(options),
    ].filter(isNotNull),
  });
}
