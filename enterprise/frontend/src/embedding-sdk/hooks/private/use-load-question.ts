import { useCallback, useState } from "react";

import {
  loadSdkQuestion,
  type LoadSdkQuestionParams,
} from "embedding-sdk/lib/load-question";
import {
  runQuestionOnNavigateSdk,
  runQuestionOnQueryChangeSdk,
} from "embedding-sdk/lib/run-question-query";
import type {
  NavigateToNewCardParams,
  SdkQuestionResult,
} from "embedding-sdk/types/question";
import { useDispatch } from "metabase/lib/redux";
import type Question from "metabase-lib/v1/Question";

export function useLoadQuestion(options: LoadSdkQuestionParams) {
  const { location, params } = options;

  const dispatch = useDispatch();

  const [result, setQuestionResult] = useState<SdkQuestionResult>({});
  const [isQuestionLoading, setIsQuestionLoading] = useState(true);

  const { question, queryResults } = result;

  const storeQuestionResult = async (
    getQuestionResult: () => Promise<SdkQuestionResult | null>,
  ) => {
    setIsQuestionLoading(true);

    try {
      const result = await getQuestionResult();

      if (result) {
        setQuestionResult(result);
      }
    } catch (e) {
      console.error(`Failed to update question result`, e);
    } finally {
      setIsQuestionLoading(false);
    }
  };

  const loadQuestion = useCallback(
    () =>
      storeQuestionResult(() =>
        dispatch(loadSdkQuestion({ location, params })),
      ),
    [dispatch, location, params],
  );

  const onQuestionChange = useCallback(
    async (nextQuestion: Question) =>
      question &&
      storeQuestionResult(() =>
        dispatch(runQuestionOnQueryChangeSdk(question, nextQuestion)),
      ),
    [dispatch, question],
  );

  const onNavigateToNewCard = useCallback(
    async (params: NavigateToNewCardParams) =>
      storeQuestionResult(() => dispatch(runQuestionOnNavigateSdk(params))),
    [dispatch],
  );

  return {
    question,
    queryResults,
    isQuestionLoading,

    loadQuestion,
    onQuestionChange,
    onNavigateToNewCard,
  };
}
