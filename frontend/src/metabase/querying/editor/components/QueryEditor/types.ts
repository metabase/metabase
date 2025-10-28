import type { SelectionRange } from "metabase/query_builder/components/NativeQueryEditor";
import type { NativeQuerySnippet } from "metabase-types/api";

export type QueryEditorUiControls = {
  selectionRange: SelectionRange[];
  modalSnippet: NativeQuerySnippet | null;
  isDataReferenceOpen: boolean;
  isSnippetSidebarOpen: boolean;
  isPreviewQueryModalOpen: boolean;
  isNativeQueryPreviewSidebarOpen: boolean;
};
