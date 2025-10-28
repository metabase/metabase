import type { QueryEditorState } from "./types";

export function getInitialState(): QueryEditorState {
  return {
    lastRunQuery: null,
    selectionRange: [],
    modalSnippet: null,
    isDataReferenceOpen: false,
    isSnippetSidebarOpen: false,
    isPreviewQueryModalOpen: false,
    isNativeQueryPreviewSidebarOpen: false,
  };
}
