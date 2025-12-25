import { useDisclosure } from "@mantine/hooks";
import { useEffect, useRef } from "react";
import { usePrevious } from "react-use";

interface UseQuestionEditorSyncOptions {
  originalId: string | number | null | undefined;
  isQuestionSaved: boolean | undefined;
  queryResults: unknown;
  queryQuestion: () => Promise<unknown>;
}

export function useQuestionEditorSync({
  originalId,
  isQuestionSaved,
  queryResults,
  queryQuestion,
}: UseQuestionEditorSyncOptions) {
  const isNewQuestion = originalId === "new";

  const [
    isEditorOpen,
    { close: closeEditor, toggle: toggleEditor, open: openEditor },
  ] = useDisclosure(isNewQuestion && !isQuestionSaved);

  const prevOriginalId = usePrevious(originalId);
  const prevIsQuestionSaved = usePrevious(isQuestionSaved);

  const queryResultsRef = useRef(queryResults);
  const queryQuestionRef = useRef(queryQuestion);
  queryResultsRef.current = queryResults;
  queryQuestionRef.current = queryQuestion;

  // Track whether we're in a "switching" state to avoid running query after switch
  const isSwitchingRef = useRef(false);

  // Detect when originalId changes (switching questions)
  if (prevOriginalId !== undefined && prevOriginalId !== originalId) {
    isSwitchingRef.current = true;
  }

  useEffect(() => {
    if (isNewQuestion && !isQuestionSaved) {
      openEditor();
    } else if (prevOriginalId === "new" && !isNewQuestion) {
      closeEditor();
    } else if (!prevIsQuestionSaved && isQuestionSaved) {
      closeEditor();

      // Only run query when saving, not when switching to a different question
      const wasSave = prevIsQuestionSaved === false && !isSwitchingRef.current;

      if (wasSave && !queryResultsRef.current) {
        queryQuestionRef.current();
      }

      // Reset switching state after processing
      isSwitchingRef.current = false;
    }
  }, [
    prevOriginalId,
    prevIsQuestionSaved,
    isNewQuestion,
    isQuestionSaved,
    originalId,
    openEditor,
    closeEditor,
  ]);

  return {
    isEditorOpen,
    openEditor,
    closeEditor,
    toggleEditor,
  };
}
