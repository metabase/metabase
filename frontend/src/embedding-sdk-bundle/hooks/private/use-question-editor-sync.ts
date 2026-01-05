import { useDisclosure } from "@mantine/hooks";

import { useExistingQuestionEditorSync } from "./use-existing-question-editor-sync";
import { useNewQuestionEditorSync } from "./use-new-question-editor-sync";

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

  useNewQuestionEditorSync({
    enabled: isNewQuestion,
    isQuestionSaved,
    queryResults,
    queryQuestion,
    openEditor,
    closeEditor,
  });

  useExistingQuestionEditorSync({
    enabled: !isNewQuestion,
    originalId,
    isQuestionSaved,
    closeEditor,
  });

  return {
    isEditorOpen,
    openEditor,
    closeEditor,
    toggleEditor,
  };
}
