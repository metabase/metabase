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

  useEffect(() => {
    if (isNewQuestion && !isQuestionSaved) {
      openEditor();
    } else if (prevOriginalId === "new" && !isNewQuestion) {
      closeEditor();
    } else if (!prevIsQuestionSaved && isQuestionSaved) {
      closeEditor();

      if (!queryResultsRef.current) {
        queryQuestionRef.current();
      }
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
