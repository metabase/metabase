import { useEffect } from "react";
import { usePrevious } from "react-use";

interface UseExistingQuestionEditorSyncOptions {
  enabled: boolean;
  originalId: string | number | null | undefined;
  isQuestionSaved: boolean | undefined;
  closeEditor: () => void;
}

/**
 * Manages editor state for existing questions (originalId !== "new").
 * - Closes the editor when transitioning from a new question to an existing one
 * - Closes the editor when an existing question finishes loading
 */
export function useExistingQuestionEditorSync({
  enabled,
  originalId,
  isQuestionSaved,
  closeEditor,
}: UseExistingQuestionEditorSyncOptions) {
  const prevOriginalId = usePrevious(originalId);
  const isPrevQuestionSaved = usePrevious(isQuestionSaved);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const isTransitionToExistingQuestion =
      (prevOriginalId === "new" && originalId !== "new") ||
      (prevOriginalId === "new-native" && originalId !== "new-native");
    const isTransitionToSaved = !isPrevQuestionSaved && isQuestionSaved;

    if (isTransitionToExistingQuestion || isTransitionToSaved) {
      closeEditor();
    }
  }, [
    prevOriginalId,
    isPrevQuestionSaved,
    enabled,
    isQuestionSaved,
    closeEditor,
    originalId,
  ]);
}
