import type { DatasetQuery, NativeQuerySnippet } from "metabase-types/api";

export type Location = {
  row: number;
  column: number;
};

export type SelectionRange = {
  start: Location;
  end: Location;
};

export type QueryEditorState = {
  lastRunQuery: DatasetQuery | null;
  selectionRange: SelectionRange[];
  modalSnippet: NativeQuerySnippet | null;
  isDataReferenceOpen: boolean;
  isSnippetSidebarOpen: boolean;
  isPreviewQueryModalOpen: boolean;
  isNativeQueryPreviewSidebarOpen: boolean;
};
