import {
  hasNextSnippetField,
  hasPrevSnippetField,
  snippet,
} from "@codemirror/autocomplete";
import type { EditorState } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import { useCallback } from "react";

import {
  expressionClauseSnippet,
  getClauseDefinition,
} from "metabase/querying/expressions";
import type * as Lib from "metabase-lib";

export function useInitialClause({
  initialExpressionClause,
}: {
  initialExpressionClause?: Lib.DefinedClauseName | null;
}) {
  return () => {};
}

export function hasActiveSnippet(state: EditorState) {
  return hasNextSnippetField(state) || hasPrevSnippetField(state);
}
