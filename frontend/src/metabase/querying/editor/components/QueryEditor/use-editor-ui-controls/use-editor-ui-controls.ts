import { useMemo } from "react";

import type {
  Location,
  SelectionRange,
} from "metabase/query_builder/components/NativeQueryEditor/types";
import type { QueryModalType } from "metabase/query_builder/constants";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import type { NativeQuerySnippet } from "metabase-types/api";

import type { QueryEditorUiControls } from "../types";

const EMPTY_SELECTION_RANGE: SelectionRange = {
  start: { row: 0, column: 0 },
  end: { row: 0, column: 0 },
};

export function useEditorUiControls(
  question: Question,
  uiControls: QueryEditorUiControls,
  onQuestionChange: (newQuestion: Question) => void,
  onUiControlsChange: (newUiControls: QueryEditorUiControls) => void,
) {
  const selectedText = useMemo(() => {
    const query = question.query();
    const text = Lib.rawNativeQuery(query) ?? "";
    const { start, end } = getSelectionPositions(
      text,
      uiControls.selectionRange,
    );
    return text.slice(start, end);
  }, [question, uiControls.selectionRange]);

  const setSelectionRange = (selectionRange: SelectionRange[]) => {
    onUiControlsChange({ ...uiControls, selectionRange });
  };

  const setModalSnippet = (modalSnippet: NativeQuerySnippet | null) => {
    onUiControlsChange({ ...uiControls, modalSnippet });
  };

  const openModal = (type: QueryModalType) => {
    if (type === "preview-query") {
      onUiControlsChange({
        ...uiControls,
        isPreviewQueryModalOpen: true,
      });
    }
  };

  const insertSnippet = (snippet: NativeQuerySnippet) => {
    const query = question.query();
    const text = Lib.rawNativeQuery(query) ?? "";

    const { start, end } = getSelectionPositions(
      text,
      uiControls.selectionRange,
    );
    const pre = text.slice(0, start);
    const post = text.slice(end);
    const newText = `${pre}{{snippet: ${snippet.name}}}${post}`;
    const newQuery = Lib.withNativeQuery(query, newText);

    onQuestionChange(question.setQuery(newQuery));
  };

  const toggleDataReference = () => {
    onUiControlsChange({
      ...uiControls,
      isDataReferenceOpen: !uiControls.isDataReferenceOpen,
      isSnippetSidebarOpen: false,
    });
  };

  const toggleSnippetSidebar = () => {
    onUiControlsChange({
      ...uiControls,
      isSnippetSidebarOpen: !uiControls.isSnippetSidebarOpen,
      isDataReferenceOpen: false,
    });
  };

  const togglePreviewQueryModal = () => {
    onUiControlsChange({
      ...uiControls,
      isPreviewQueryModalOpen: !uiControls.isPreviewQueryModalOpen,
    });
  };

  const toggleNativeQueryPreviewSidebar = () => {
    onUiControlsChange({
      ...uiControls,
      isNativeQueryPreviewSidebarOpen:
        !uiControls.isNativeQueryPreviewSidebarOpen,
    });
  };

  const convertToNative = (newQuestion: Question) => {
    onUiControlsChange({
      ...uiControls,
      isNativeQueryPreviewSidebarOpen: false,
    });
    onQuestionChange(newQuestion);
  };

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
