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
 * Synchronizes the notebook editor open/close state with the question lifecycle.
 *
 * The hook manages automatic editor state transitions based on whether the user
 * is working with a new question or an existing one:
 */
export function useQuestionEditorSync({
  originalId,
  isQuestionSaved,
  queryResults,
  queryQuestion,
}: UseQuestionEditorSyncOptions) {
  const isNewQuestion = originalId === "new" || originalId === "new-native";

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
