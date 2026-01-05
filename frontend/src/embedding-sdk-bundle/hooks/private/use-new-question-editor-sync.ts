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
 * Handles editor state for new questions.
 * Opens editor automatically and runs query after saving.
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
