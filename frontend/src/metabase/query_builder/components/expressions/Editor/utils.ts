import {
  hasNextSnippetField,
  hasPrevSnippetField,
  snippet,
} from "@codemirror/autocomplete";
import type { EditorState } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import { useCallback } from "react";

import {
  type DefinedClauseName,
  expressionClauseSnippet,
  getClauseDefinition,
} from "metabase/querying/expressions";

export function useInitialClause({
  initialExpressionClause,
}: {
  initialExpressionClause?: DefinedClauseName | null;
}) {
  return useCallback(
    (view: EditorView) => {
      if (!initialExpressionClause) {
        return;
      }

      const clause = getClauseDefinition(initialExpressionClause);

      snippet(expressionClauseSnippet(clause))(
        {
          state: view.state,
          dispatch: view.dispatch,
        },
        null,
        view.state.selection.main.from,
        view.state.selection.main.to,
      );
    },
    [initialExpressionClause],
  );
}

export function hasActiveSnippet(state: EditorState) {
  return hasNextSnippetField(state) || hasPrevSnippetField(state);
}
