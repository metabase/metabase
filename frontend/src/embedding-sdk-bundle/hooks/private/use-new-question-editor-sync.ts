import { useEffect, useRef } from "react";
import { usePrevious } from "react-use";

interface UseNewQuestionEditorSyncOptions {
  enabled: boolean;
  isQuestionSaved: boolean | undefined;
  queryResults: unknown;
  queryQuestion: () => Promise<unknown>;
  openEditor: () => void;
  closeEditor: () => void;
}

/**
 * Manages editor state for new questions
 * - Opens the editor automatically when the question is unsaved
 * - Closes the editor when the question is saved
 * - Runs the query after saving if no results are available yet
 *   (handles the case when user saves without visualizing first)
 */
export function useNewQuestionEditorSync({
  enabled,
  isQuestionSaved,
  queryResults,
  queryQuestion,
  openEditor,
  closeEditor,
}: UseNewQuestionEditorSyncOptions) {
  const isPrevQuestionSaved = usePrevious(isQuestionSaved);

  const queryResultsRef = useRef(queryResults);
  const queryQuestionRef = useRef(queryQuestion);

  queryResultsRef.current = queryResults;
  queryQuestionRef.current = queryQuestion;

  useEffect(() => {
    if (!enabled) {
      return;
    }

    if (!isQuestionSaved) {
      openEditor();
    } else if (isPrevQuestionSaved === false) {
      closeEditor();

      if (!queryResultsRef.current) {
        queryQuestionRef.current();
      }
    }
  }, [enabled, isQuestionSaved, isPrevQuestionSaved, openEditor, closeEditor]);
}
