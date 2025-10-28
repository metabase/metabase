import { useCallback, useMemo, useRef } from "react";

import type {
  Location,
  SelectionRange,
} from "metabase/query_builder/components/NativeQueryEditor/types";
import type { QueryModalType } from "metabase/query_builder/constants";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import type { NativeQuerySnippet } from "metabase-types/api";

import type { QueryEditorState } from "../types";

const EMPTY_SELECTION_RANGE: SelectionRange = {
  start: { row: 0, column: 0 },
  end: { row: 0, column: 0 },
};

export function useQueryControls(
  question: Question,
  state: QueryEditorState,
  setQuestion: (newQuestion: Question) => void,
  setState: (newState: QueryEditorState) => void,
) {
  const stateRef = useRef(state);
  stateRef.current = state;

  const selectedText = useMemo(() => {
    const query = question.query();
    const text = Lib.rawNativeQuery(query) ?? "";
    const { start, end } = getSelectionPositions(text, state.selectionRange);
    return text.slice(start, end);
  }, [question, state.selectionRange]);

  const setSelectionRange = useCallback(
    (selectionRange: SelectionRange[]) => {
      setState({ ...stateRef.current, selectionRange });
    },
    [setState],
  );

  const setModalSnippet = useCallback(
    (modalSnippet: NativeQuerySnippet | null) => {
      setState({ ...stateRef.current, modalSnippet });
    },
    [setState],
  );

  const openModal = useCallback(
    (type: QueryModalType) => {
      if (type === "preview-query") {
        setState({
          ...stateRef.current,
          isPreviewQueryModalOpen: true,
        });
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
        stateRef.current.selectionRange,
      );
      const pre = text.slice(0, start);
      const post = text.slice(end);
      const newText = `${pre}{{snippet: ${snippet.name}}}${post}`;
      const newQuery = Lib.withNativeQuery(query, newText);

      setQuestion(question.setQuery(newQuery));
    },
    [question, setQuestion],
  );

  const toggleDataReference = useCallback(() => {
    setState({
      ...stateRef.current,
      isDataReferenceOpen: !stateRef.current.isDataReferenceOpen,
      isSnippetSidebarOpen: false,
    });
  }, [setState]);

  const toggleSnippetSidebar = useCallback(() => {
    setState({
      ...stateRef.current,
      isSnippetSidebarOpen: !stateRef.current.isSnippetSidebarOpen,
      isDataReferenceOpen: false,
    });
  }, [setState]);

  const togglePreviewQueryModal = useCallback(() => {
    setState({
      ...stateRef.current,
      isPreviewQueryModalOpen: !stateRef.current.isPreviewQueryModalOpen,
    });
  }, [setState]);

  const toggleNativeQueryPreviewSidebar = useCallback(() => {
    setState({
      ...stateRef.current,
      isNativeQueryPreviewSidebarOpen:
        !stateRef.current.isNativeQueryPreviewSidebarOpen,
    });
  }, [setState]);

  const convertToNative = useCallback(
    (newQuestion: Question) => {
      setState({
        ...stateRef.current,
        isNativeQueryPreviewSidebarOpen: false,
      });
      setQuestion(newQuestion);
    },
    [setQuestion, setState],
  );

  return {
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
