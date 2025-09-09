import { useState } from "react";

import type {
  UseAnalyzeQuestionUpdateProps,
  UseAnalyzeQuestionUpdateResult,
} from "metabase/plugins";
import { useAnalyzeCardUpdateMutation } from "metabase-enterprise/api";
import type Question from "metabase-lib/v1/Question";

export function useAnalyzeQuestionUpdate({
  onSave,
}: UseAnalyzeQuestionUpdateProps): UseAnalyzeQuestionUpdateResult {
  const [question, setQuestion] = useState<Question>();
  const [isConfirming, setIsConfirming] = useState(false);
  const [analyzeCard, { data }] = useAnalyzeCardUpdateMutation();

  const handleInitialSave = async (question: Question) => {
    const { data } = await analyzeCard({ card: question.card() });
    if (data != null && !data.success) {
      setQuestion(question);
      setIsConfirming(true);
    } else {
      setQuestion(undefined);
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
    analyzeData: data,
    isConfirming,
    handleInitialSave,
    handleSaveAfterConfirmation,
  };
}
