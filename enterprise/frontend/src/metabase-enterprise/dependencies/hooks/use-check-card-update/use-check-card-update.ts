import { useCallback, useState } from "react";

import { useStore } from "metabase/lib/redux";
import type {
  UseCheckCardUpdateProps,
  UseCheckCardUpdateResult,
} from "metabase/plugins";
import { useLazyCheckCardUpdateQuery } from "metabase-enterprise/api";
import type Question from "metabase-lib/v1/Question";

export function useCheckCardUpdate({
  getSubmittableQuestion,
  onSave,
}: UseCheckCardUpdateProps): UseCheckCardUpdateResult {
  const store = useStore();
  const [question, setQuestion] = useState<Question | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);
  const [checkCard, { data }] = useLazyCheckCardUpdateQuery();

  const handleInitialSave = useCallback(
    async (question: Question) => {
      const submittableQuestion = getSubmittableQuestion(
        store.getState(),
        question,
      );
      const { id, dataset_query, result_metadata } = submittableQuestion.card();
      const { data } = await checkCard({ id, dataset_query, result_metadata });
      if (data != null && !data.success) {
        setQuestion(question);
        setIsConfirming(true);
      } else {
        setQuestion(null);
        setIsConfirming(false);
        await onSave(question);
      }
    },
    [store, getSubmittableQuestion, checkCard, onSave],
  );

  const handleSaveAfterConfirmation = useCallback(async () => {
    if (question != null) {
      await onSave(question);
    }
  }, [question, onSave]);

  return {
    checkData: data,
    isConfirming,
    handleInitialSave,
    handleSaveAfterConfirmation,
  };
}
