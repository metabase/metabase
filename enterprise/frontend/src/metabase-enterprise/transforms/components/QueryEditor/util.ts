import { useMemo } from "react";

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

export function useSelectedText(
  question: Question,
  selectionRange: SelectionRange[],
) {
  return useMemo(() => {
    const query = question.query();
    const text = Lib.rawNativeQuery(query) ?? "";
    const { start, end } = getSelectionPositions(text, selectionRange);
    return text.slice(start, end);
  }, [question, selectionRange]);
}

export function useInsertSnippetHandler({
  selectionRange,
  question,
  onChange,
}: {
  selectionRange: SelectionRange[];
  question: Question;
  onChange: (question: Question) => void;
}) {
  return function handleInsertSnippet(snippet: NativeQuerySnippet) {
    const query = question.query();
    const text = Lib.rawNativeQuery(query) ?? "";

    const { start, end } = getSelectionPositions(text, selectionRange);

    const pre = text.slice(0, start);
    const post = text.slice(end);

    const newText = `${pre}{{snippet: ${snippet.name}}}${post}`;
    const newQuery = Lib.withNativeQuery(query, newText);

    onChange(question.setQuery(newQuery));
  };
}
