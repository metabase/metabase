import { useCallback, useMemo, useRef } from "react";

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
  const stateRef = useRef(uiState);
  stateRef.current = uiState;

  const setState = useCallback(
    (callback: (state: QueryEditorUiState) => QueryEditorUiState) => {
      setUiState(callback(stateRef.current));
    },
    [setUiState],
  );

  const selectedText = useMemo(() => {
    const query = question.query();
    const text = Lib.rawNativeQuery(query) ?? "";
    const { start, end } = getSelectionPositions(text, uiState.selectionRange);
    return text.slice(start, end);
  }, [question, uiState.selectionRange]);

  const setSelectionRange = useCallback(
    (selectionRange: SelectionRange[]) => {
      setState((state) => ({ ...state, selectionRange }));
    },
    [setState],
  );

  const setModalSnippet = useCallback(
    (modalSnippet: NativeQuerySnippet | null) => {
      setState((state) => ({ ...state, modalSnippet }));
    },
    [setState],
  );

  const openModal = useCallback(
    (type: QueryModalType) => {
      if (type === "preview-query") {
        setState((state) => ({
          ...state,
          modalType: "preview-query",
        }));
      }
    },
    [setState],
  );

  const insertSnippet = useCallback(
    (snippet: NativeQuerySnippet) => {
      const query = question.query();
      const text = Lib.rawNativeQuery(query) ?? "";

      const { start, end } = getSelectionPositions(
        text,
        uiState.selectionRange,
      );
      const pre = text.slice(0, start);
      const post = text.slice(end);
      const newText = `${pre}{{snippet: ${snippet.name}}}${post}`;
      const newQuery = Lib.withNativeQuery(query, newText);

      setQuestion(question.setQuery(newQuery));
    },
    [question, setQuestion, uiState.selectionRange],
  );

  const convertToNative = useCallback(
    (newQuestion: Question) => {
      setState((state) => ({ ...state, sidebarType: null }));
      setQuestion(newQuestion);
    },
    [setQuestion, setState],
  );

  const toggleSidebar = useCallback(
    (sidebarType: QueryEditorSidebarType) => {
      setState((state) => ({
        ...state,
        sidebarType: state.sidebarType === sidebarType ? null : sidebarType,
      }));
    },
    [setState],
  );

  const toggleDataReferenceSidebar = useCallback(() => {
    toggleSidebar("data-reference");
  }, [toggleSidebar]);

  const toggleSnippetSidebar = useCallback(() => {
    toggleSidebar("snippet");
  }, [toggleSidebar]);

  const toggleNativeQuerySidebar = useCallback(() => {
    toggleSidebar("native-query");
  }, [toggleSidebar]);

  const toggleModal = useCallback(
    (modalType: QueryEditorModalType) => {
      setState((state) => ({
        ...state,
        modalType: state.modalType === modalType ? null : modalType,
      }));
    },
    [setState],
  );

  const togglePreviewQueryModal = useCallback(() => {
    toggleModal("preview-query");
  }, [toggleModal]);

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
