import { useDisclosure } from "@mantine/hooks";
import { useEffect, useRef } from "react";
import { usePrevious } from "react-use";

interface UseQuestionEditorSyncOptions {
  originalId: string | number | null | undefined;
  isQuestionSaved: boolean | undefined;
  queryResults: unknown;
  queryQuestion: () => Promise<unknown>;
}

/**
 * Manages the editor open/close state and query execution for SDK questions.
 *
 * Handles three main scenarios:
 * 1. New question: Opens editor automatically
 * 2. Question saved: Closes editor and runs query if results aren't available
 * 3. Question switched: Closes editor without running query (SDK handles loading)
 */
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

  // Use refs to avoid triggering effect when these change
  const queryResultsRef = useRef(queryResults);
  const queryQuestionRef = useRef(queryQuestion);

  queryResultsRef.current = queryResults;
  queryQuestionRef.current = queryQuestion;

  // Track when user switches to a different question (vs saving current one).
  // This distinguishes between:
  // - Save: originalId stays same (or changes from "new" to real ID via prop)
  // - Switch: originalId changes to a different question's ID
  const isSwitchingQuestionsRef = useRef(false);

  const didQuestionIdChange =
    prevOriginalId !== undefined && prevOriginalId !== originalId;

  if (didQuestionIdChange) {
    isSwitchingQuestionsRef.current = true;
  }

  useEffect(() => {
    // Open editor for new unsaved questions
    if (isNewQuestion && !isQuestionSaved) {
      openEditor();
      return;
    }

    // Close editor when transitioning from new question to existing
    if (prevOriginalId === "new" && !isNewQuestion) {
      closeEditor();
      return;
    }

    // Handle question becoming saved (either via save action or loading existing)
    if (!prevIsQuestionSaved && isQuestionSaved) {
      closeEditor();

      // Run query only when saving (not when switching/loading a different question).
      // When saving, isSwitchingQuestionsRef is false because originalId doesn't change.
      // When switching, isSwitchingQuestionsRef is true because originalId changes.
      const isSaveAction =
        prevIsQuestionSaved === false && !isSwitchingQuestionsRef.current;

      if (isNewQuestion && isSaveAction && !queryResultsRef.current) {
        queryQuestionRef.current();
      }

      isSwitchingQuestionsRef.current = false;
    }
  }, [
    prevOriginalId,
    prevIsQuestionSaved,
    isNewQuestion,
    isQuestionSaved,
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
