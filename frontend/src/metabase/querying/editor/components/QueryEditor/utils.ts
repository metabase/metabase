import type { QueryEditorUiControls } from "./types";

export function getInitialUiControls(): QueryEditorUiControls {
  return {
    selectionRange: [],
    modalSnippet: null,
    isDataReferenceOpen: false,
    isSnippetSidebarOpen: false,
    isPreviewQueryModalOpen: false,
    isNativeQueryPreviewSidebarOpen: false,
  };
}
