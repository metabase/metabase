import { useMemo } from "react";

import type {
  Location,
  SelectionRange,
} from "metabase/query_builder/components/NativeQueryEditor/types";
import type { QueryModalType } from "metabase/query_builder/constants";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import type { NativeQuerySnippet } from "metabase-types/api";

import type {
  QueryEditorModalType,
  QueryEditorSidebarType,
  QueryEditorUiState,
} from "../../components/QueryEditor/types";

const EMPTY_SELECTION_RANGE: SelectionRange = {
  start: { row: 0, column: 0 },
  end: { row: 0, column: 0 },
};

export function useQueryControls(
  question: Question,
  uiState: QueryEditorUiState,
  setQuestion: (newQuestion: Question) => void,
  setUiState: (newUiState: QueryEditorUiState) => void,
) {
  const selectedText = useMemo(() => {
    const query = question.query();
    const text = Lib.rawNativeQuery(query) ?? "";
    const { start, end } = getSelectionPositions(text, uiState.selectionRange);
    return text.slice(start, end);
  }, [question, uiState.selectionRange]);

  const setSelectionRange = (selectionRange: SelectionRange[]) => {
    setUiState({ ...uiState, selectionRange });
  };

  const setModalSnippet = (modalSnippet: NativeQuerySnippet | null) => {
    setUiState({ ...uiState, modalSnippet });
  };

  const openModal = (type: QueryModalType) => {
    if (type === "preview-query") {
      setUiState({
        ...uiState,
        modalType: "preview-query",
      });
    }
  };

  const insertSnippet = (snippet: NativeQuerySnippet) => {
    const query = question.query();
    const text = Lib.rawNativeQuery(query) ?? "";

    const { start, end } = getSelectionPositions(text, uiState.selectionRange);
    const pre = text.slice(0, start);
    const post = text.slice(end);
    const newText = `${pre}{{snippet: ${snippet.name}}}${post}`;
    const newQuery = Lib.withNativeQuery(query, newText);

    setQuestion(question.setQuery(newQuery));
  };

  const convertToNative = (newQuestion: Question) => {
    setUiState({ ...uiState, sidebarType: null });
    setQuestion(newQuestion);
  };

  const toggleSidebar = (sidebarType: QueryEditorSidebarType) => {
    setUiState({
      ...uiState,
      sidebarType: uiState.sidebarType === sidebarType ? null : sidebarType,
    });
  };

  const toggleDataReferenceSidebar = () => {
    toggleSidebar("data-reference");
  };

  const toggleSnippetSidebar = () => {
    toggleSidebar("snippet");
  };

  const toggleNativeQuerySidebar = () => {
    toggleSidebar("native-query");
  };

  const toggleModal = (modalType: QueryEditorModalType) => {
    setUiState({
      ...uiState,
      modalType: uiState.modalType === modalType ? null : modalType,
    });
  };

  const togglePreviewQueryModal = () => {
    toggleModal("preview-query");
  };

  return {
    selectedText,
    openModal,
    setSelectionRange,
    setModalSnippet,
    insertSnippet,
    convertToNative,
    toggleDataReferenceSidebar,
    toggleSnippetSidebar,
    toggleNativeQuerySidebar,
    togglePreviewQueryModal,
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
