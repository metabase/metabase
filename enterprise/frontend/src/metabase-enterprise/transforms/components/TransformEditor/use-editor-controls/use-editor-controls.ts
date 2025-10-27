import { useMemo, useState } from "react";

import type {
  Location,
  SelectionRange,
} from "metabase/query_builder/components/NativeQueryEditor/types";
import type { QueryModalType } from "metabase/query_builder/constants";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import type { NativeQuerySnippet } from "metabase-types/api";

const EMPTY_SELECTION_RANGE: SelectionRange = {
  start: { row: 0, column: 0 },
  end: { row: 0, column: 0 },
};

type EditorUiState = {
  selectionRange: SelectionRange[];
  modalSnippet: NativeQuerySnippet | null;
  isDataReferenceOpen: boolean;
  isSnippetSidebarOpen: boolean;
  isPreviewQueryModalOpen: boolean;
  isNativeQueryPreviewSidebarOpen: boolean;
};

export function useEditorControls(
  question: Question,
  onQuestionChange: (newQuestion: Question) => void,
) {
  const [state, setState] = useState<EditorUiState>({
    selectionRange: [],
    modalSnippet: null,
    isDataReferenceOpen: false,
    isSnippetSidebarOpen: false,
    isPreviewQueryModalOpen: false,
    isNativeQueryPreviewSidebarOpen: false,
  });

  const selectedText = useMemo(() => {
    const query = question.query();
    const text = Lib.rawNativeQuery(query) ?? "";
    const { start, end } = getSelectionPositions(text, state.selectionRange);
    return text.slice(start, end);
  }, [question, state.selectionRange]);

  const setSelectionRange = (selectionRange: SelectionRange[]) => {
    setState((state) => ({ ...state, selectionRange }));
  };

  const setModalSnippet = (modalSnippet: NativeQuerySnippet | null) => {
    setState((state) => ({ ...state, modalSnippet }));
  };

  const openModal = (type: QueryModalType) => {
    if (type === "preview-query") {
      setState((state) => ({ ...state, isPreviewQueryModalOpen: true }));
    }
  };

  const insertSnippet = (snippet: NativeQuerySnippet) => {
    const query = question.query();
    const text = Lib.rawNativeQuery(query) ?? "";

    const { start, end } = getSelectionPositions(text, state.selectionRange);
    const pre = text.slice(0, start);
    const post = text.slice(end);
    const newText = `${pre}{{snippet: ${snippet.name}}}${post}`;
    const newQuery = Lib.withNativeQuery(query, newText);

    onQuestionChange(question.setQuery(newQuery));
  };

  const toggleDataReference = () => {
    setState((state) => ({
      ...state,
      isDataReferenceOpen: state.isDataReferenceOpen,
      isSnippetSidebarOpen: false,
    }));
  };

  const toggleSnippetSidebar = () => {
    setState((state) => ({
      ...state,
      isDataReferenceOpen: false,
      isSnippetSidebarOpen: state.isSnippetSidebarOpen,
    }));
  };

  const togglePreviewQueryModal = () => {
    setState((state) => ({
      ...state,
      isPreviewQueryModalOpen: !state.isPreviewQueryModalOpen,
    }));
  };

  const toggleNativeQueryPreviewSidebar = () => {
    setState((state) => ({
      ...state,
      isNativeQueryPreviewSidebarOpen: !state.isNativeQueryPreviewSidebarOpen,
    }));
  };

  const convertToNative = (newQuestion: Question) => {
    setState((state) => ({
      ...state,
      isNativeQueryPreviewSidebarOpen: false,
    }));
    onQuestionChange(newQuestion);
  };

  return {
    ...state,
    selectedText,
    openModal,
    setSelectionRange,
    setModalSnippet,
    insertSnippet,
    toggleDataReference,
    toggleSnippetSidebar,
    togglePreviewQueryModal,
    toggleNativeQueryPreviewSidebar,
    convertToNative,
  };
}

function locationToPosition(text: string, location: Location): number {
  const lines = text.split("\n");
  return lines.reduce((acc, line, index) => {
    if (index < location.row) {
      return acc + line.length + 1;
    }
    return acc;
  }, location.column);
}

function getSelectionPositions(text: string, selectionRange: SelectionRange[]) {
  const range = selectionRange[0] ?? EMPTY_SELECTION_RANGE;

  return {
    start: locationToPosition(text, range.start),
    end: locationToPosition(text, range.end),
  };
}
