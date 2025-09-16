import { useMemo } from "react";

import type {
  Location,
  SelectionRange,
} from "metabase/query_builder/components/NativeQueryEditor/types";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import type { NativeQuerySnippet } from "metabase-types/api";

export function locationToPosition(text: string, location: Location): number {
  const lines = text.split("\n");
  return lines.reduce((acc, line, index) => {
    if (index < location.row) {
      return acc + line.length + 1;
    }
    return acc;
  }, location.column);
}

export function useSelectedText(
  question: Question,
  selectionRange: SelectionRange[],
) {
  return useMemo(() => {
    const range = selectionRange[0];
    if (!range) {
      return null;
    }

    const query = question.query();
    const text = Lib.rawNativeQuery(query);
    const { start, end } = range;

    const selectionStart = locationToPosition(text, start);
    const selectionEnd = locationToPosition(text, end);
    return text.slice(selectionStart, selectionEnd);
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
    const text = Lib.rawNativeQuery(query);

    const range = selectionRange[0];
    if (!range) {
      return;
    }

    const { start, end } = range;

    const selectionStart = locationToPosition(text, start);
    const selectionEnd = locationToPosition(text, end);

    const newText =
      text.slice(0, selectionStart) +
      `{{snippet: ${snippet.name}}}` +
      text.slice(selectionEnd);

    const newQuery = Lib.withNativeQuery(query, newText);
    onChange(question.setQuery(newQuery));
  };
}
