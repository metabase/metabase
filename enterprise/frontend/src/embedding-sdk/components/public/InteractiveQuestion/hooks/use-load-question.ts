import { useCallback, useState } from "react";

import { loadSdkQuestion } from "embedding-sdk/lib/question";
import type { SdkQuestionResult } from "embedding-sdk/types/question";
import { useDispatch } from "metabase/lib/redux";

export type UseLoadQuestionParams = {
  questionId: number;
};

interface LoadQuestionHookResult extends SdkQuestionResult {
  loadQuestion: () => void;
  isQuestionLoading: boolean;
}

export const useLoadQuestion = (
  options: UseLoadQuestionParams,
): LoadQuestionHookResult => {
  const { questionId } = options;

  const dispatch = useDispatch();

  const [result, setResult] = useState<SdkQuestionResult>({});
  const [isQuestionLoading, setIsQuestionLoading] = useState(true);

  const loadQuestion = useCallback(async () => {
    setIsQuestionLoading(true);

    try {
      const result = await dispatch(loadSdkQuestion(questionId));
      setResult(result);
    } catch (e) {
      console.error(`Failed to get question`, e);
    } finally {
      setIsQuestionLoading(false);
    }
  }, [dispatch, questionId]);

  return { loadQuestion, isQuestionLoading, ...result };
};
