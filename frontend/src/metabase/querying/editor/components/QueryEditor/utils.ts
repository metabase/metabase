import type { QueryEditorUiState } from "../../types";

export function getInitialUiState(): QueryEditorUiState {
  return {
    lastRunResult: null,
    lastRunQuery: null,
    selectionRange: [],
    modalSnippet: null,
    sidebarType: null,
    modalType: null,
  };
}
