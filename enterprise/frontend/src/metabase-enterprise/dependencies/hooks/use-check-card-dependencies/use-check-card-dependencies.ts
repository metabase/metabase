import { useCallback, useState } from "react";

import { useStore } from "metabase/lib/redux";
import type {
  UseCheckCardDependenciesProps,
  UseCheckCardDependenciesResult,
} from "metabase/plugins";
import { useLazyCheckCardDependenciesQuery } from "metabase-enterprise/api";
import type Question from "metabase-lib/v1/Question";

export function useCheckCardDependencies({
  getSubmittableQuestion,
  onSave,
}: UseCheckCardDependenciesProps): UseCheckCardDependenciesResult {
  const store = useStore();
  const [question, setQuestion] = useState<Question | null>(null);
  const [isConfirmationShown, setIsConfirmationShown] = useState(false);
  const [checkCard, { data }] = useLazyCheckCardDependenciesQuery();

  const handleInitialSave = useCallback(
    async (question: Question) => {
      const submittableQuestion = getSubmittableQuestion(
        store.getState(),
        question,
      );
      const { id, type, dataset_query, result_metadata } =
        submittableQuestion.card();
      const data = await checkCard({
        id,
        type,
        dataset_query,
        result_metadata,
      }).unwrap();
      if (data != null && !data.success) {
        setQuestion(question);
        setIsConfirmationShown(true);
      } else {
        await onSave(question);
      }
    },
    [store, getSubmittableQuestion, checkCard, onSave],
  );

  const handleCloseConfirmation = useCallback(() => {
    setQuestion(null);
    setIsConfirmationShown(false);
  }, []);

  const handleSaveAfterConfirmation = useCallback(async () => {
    if (question != null) {
      await onSave(question);
      handleCloseConfirmation();
    }
  }, [question, onSave, handleCloseConfirmation]);

  return {
    checkData: data,
    isConfirmationShown,
    handleInitialSave,
    handleSaveAfterConfirmation,
    handleCloseConfirmation,
  };
}
