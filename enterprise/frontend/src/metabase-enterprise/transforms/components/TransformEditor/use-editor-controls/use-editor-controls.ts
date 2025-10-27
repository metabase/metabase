import { useDisclosure } from "@mantine/hooks";
import { useMemo, useState } from "react";

import type {
  Location,
  SelectionRange,
} from "metabase/query_builder/components/NativeQueryEditor/types";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import type { NativeQuerySnippet } from "metabase-types/api";

const EMPTY_SELECTION_RANGE: SelectionRange = {
  start: { row: 0, column: 0 },
  end: { row: 0, column: 0 },
};

export function useEditorControls(
  question: Question,
  onQuestionChange: (newQuestion: Question) => void,
) {
  const [selectionRange, setSelectionRange] = useState<SelectionRange[]>([]);
  const [modalSnippet, setModalSnippet] = useState<NativeQuerySnippet | null>(
    null,
  );

  const [
    isDataReferenceOpen,
    { toggle: toggleDataReference, close: closeDataReference },
  ] = useDisclosure();

  const [
    isSnippetSidebarOpen,
    { toggle: toggleSnippetSidebar, close: closeSnippetSidebar },
  ] = useDisclosure();

  const selectedText = useMemo(() => {
    const query = question.query();
    const text = Lib.rawNativeQuery(query) ?? "";
    const { start, end } = getSelectionPositions(text, selectionRange);
    return text.slice(start, end);
  }, [question, selectionRange]);

  const handleInsertSnippet = (snippet: NativeQuerySnippet) => {
    const query = question.query();
    const text = Lib.rawNativeQuery(query) ?? "";

    const { start, end } = getSelectionPositions(text, selectionRange);
    const pre = text.slice(0, start);
    const post = text.slice(end);
    const newText = `${pre}{{snippet: ${snippet.name}}}${post}`;
    const newQuery = Lib.withNativeQuery(query, newText);

    onQuestionChange(question.setQuery(newQuery));
  };

  const handleToggleDataReference = () => {
    closeSnippetSidebar();
    toggleDataReference();
  };

  const handleToggleSnippetSidebar = () => {
    closeDataReference();
    toggleSnippetSidebar();
  };

  return {
    selectedText,
    modalSnippet,
    isDataReferenceOpen,
    isSnippetSidebarOpen,
    handleSelectionRangeChange: setSelectionRange,
    handleModalSnippetChange: setModalSnippet,
    handleInsertSnippet,
    handleToggleDataReference,
    handleToggleSnippetSidebar,
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
