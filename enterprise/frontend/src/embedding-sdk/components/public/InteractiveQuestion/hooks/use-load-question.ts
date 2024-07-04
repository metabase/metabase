import { useCallback, useState } from "react";

import { loadSdkQuestion } from "embedding-sdk/lib/load-question";
import type { SdkQuestionResult } from "embedding-sdk/types/question";
import { useDispatch } from "metabase/lib/redux";
import type Question from "metabase-lib/v1/Question";

export type UseLoadQuestionParams = {
  questionId: number;
};

interface LoadQuestionHookResult extends SdkQuestionResult {
  setQuestion: (question: Question) => void;
  loadQuestion: () => Promise<void>;
  isQuestionLoading: boolean;
}

export const useLoadQuestion = (
  options: UseLoadQuestionParams,
): LoadQuestionHookResult => {
  const { questionId } = options;

  const dispatch = useDispatch();

  const [result, setQuestionResult] = useState<SdkQuestionResult>({});
  const [isQuestionLoading, setIsQuestionLoading] = useState(true);

  const loadQuestion = useCallback(async () => {
    setIsQuestionLoading(true);

    try {
      const result = await dispatch(loadSdkQuestion(questionId));
      setQuestionResult(result);
    } catch (e) {
      console.error(`Failed to get question`, e);
    } finally {
      setIsQuestionLoading(false);
    }
  }, [dispatch, questionId]);

  const setQuestion = (question: Question) =>
    setQuestionResult(result => ({
      ...result,
      question,
      card: question.card(),
    }));

  return { setQuestion, loadQuestion, isQuestionLoading, ...result };
};
