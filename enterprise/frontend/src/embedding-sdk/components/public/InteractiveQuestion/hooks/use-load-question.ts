import { useCallback, useState } from "react";

import { loadSdkQuestion } from "embedding-sdk/lib/question";
import { useDispatch } from "metabase/lib/redux";

export type UseLoadQuestionParams = {
  questionId: number;
};

export const useLoadQuestion = (options: UseLoadQuestionParams) => {
  const { questionId } = options;

  const dispatch = useDispatch();
  const [isQuestionLoading, setIsQuestionLoading] = useState(true);

  const loadQuestion = useCallback(async () => {
    setIsQuestionLoading(true);

    try {
      await dispatch(loadSdkQuestion(questionId));
    } catch (e) {
      console.error(`Failed to get question`, e);
    } finally {
      setIsQuestionLoading(false);
    }
  }, [dispatch, questionId]);

  return { loadQuestion, isQuestionLoading };
};
