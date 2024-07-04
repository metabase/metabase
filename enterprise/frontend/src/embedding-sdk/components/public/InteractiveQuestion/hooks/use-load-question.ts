import { useCallback, useState } from "react";

import { loadSdkQuestion } from "embedding-sdk/lib/load-question";
import type { SdkQuestionResult } from "embedding-sdk/types/question";
import { useDispatch } from "metabase/lib/redux";

export type UseLoadQuestionParams = {
  questionId: number;
};

interface LoadQuestionHookResult extends SdkQuestionResult {
  loadQuestion: () => Promise<void>;
  isQuestionLoading: boolean;
  setQuestionResult(result: SdkQuestionResult): void;
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

  return { loadQuestion, isQuestionLoading, setQuestionResult, ...result };
};
