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
      options: (currentCompletions(state) ??
        []) as readonly ExpressionSuggestion[],
      selectedOption: selectedCompletionIndex(state),
    };
  }, [state]);

  const prevCompletions = usePrevious(completions) ?? completions;

  // when pending render the previous completions to avoid flickering
  return completions.status === "pending" ? prevCompletions : completions;
}
