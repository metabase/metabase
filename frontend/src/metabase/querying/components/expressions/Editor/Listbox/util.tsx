import {
  completionStatus,
  currentCompletions,
  selectedCompletionIndex,
} from "@codemirror/autocomplete";
import type { EditorState } from "@codemirror/state";
import { useMemo } from "react";
import { usePrevious } from "react-use";

import type { ExpressionSuggestion } from "metabase/querying/expressions";

export function useCompletions(state: EditorState) {
  const completions = useMemo(() => {
    return {
      status: completionStatus(state),
      // Unjustified type cast. FIXME
      options: (currentCompletions(state) ??
        []) as readonly ExpressionSuggestion[],
      selectedOption: selectedCompletionIndex(state),
    };
  }, [state]);

  const prevCompletions = usePrevious(completions) ?? completions;

  // While a source is pending, CodeMirror keeps the options of the faster
  // sources, and their highlight. Only an empty list shows the previous one,
  // to avoid flickering.
  return completions.status === "pending" && completions.options.length === 0
    ? prevCompletions
    : completions;
}
