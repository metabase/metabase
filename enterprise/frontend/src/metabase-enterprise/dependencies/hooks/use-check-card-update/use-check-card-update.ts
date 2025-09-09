import { useState } from "react";

import type {
  UseCheckCardUpdateProps,
  UseCheckCardUpdateResult,
} from "metabase/plugins";
import { useLazyCheckCardUpdateQuery } from "metabase-enterprise/api";
import type Question from "metabase-lib/v1/Question";

export function useCheckCardUpdate({
  onSave,
}: UseCheckCardUpdateProps): UseCheckCardUpdateResult {
  const [question, setQuestion] = useState<Question | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);
  const [checkCard, { data }] = useLazyCheckCardUpdateQuery();

  const handleInitialSave = async (question: Question) => {
    const { data } = await checkCard({ card: question.card() });
    if (data != null && !data.success) {
      setQuestion(question);
      setIsConfirming(true);
    } else {
      setQuestion(null);
      setIsConfirming(false);
      await onSave(question);
    }
  };

  const handleSaveAfterConfirmation = async () => {
    if (question != null) {
      await onSave(question);
    }
  };

  return {
    checkData: data,
    isConfirming,
    handleInitialSave,
    handleSaveAfterConfirmation,
  };
}
