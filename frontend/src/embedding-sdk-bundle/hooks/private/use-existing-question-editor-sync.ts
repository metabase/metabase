import { useEffect } from "react";
import { usePrevious } from "react-use";

interface UseExistingQuestionEditorSyncOptions {
  enabled: boolean;
  originalId: string | number | null | undefined;
  isQuestionSaved: boolean | undefined;
  closeEditor: () => void;
}

export function useExistingQuestionEditorSync({
  enabled,
  originalId,
  isQuestionSaved,
  closeEditor,
}: UseExistingQuestionEditorSyncOptions) {
  const prevOriginalId = usePrevious(originalId);
  const prevIsQuestionSaved = usePrevious(isQuestionSaved);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const isTransitionToExistingQuestion =
      prevOriginalId === "new" && originalId !== "new";
    const isTransitionToSaved = !prevIsQuestionSaved && isQuestionSaved;

    if (isTransitionToExistingQuestion || isTransitionToSaved) {
      closeEditor();
    }
  }, [
    prevOriginalId,
    prevIsQuestionSaved,
    enabled,
    isQuestionSaved,
    closeEditor,
    originalId,
  ]);
}
