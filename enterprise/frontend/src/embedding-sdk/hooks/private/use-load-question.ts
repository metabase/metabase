import { useCallback, useState } from "react";

import {
  runQuestionOnLoadSdk,
  runQuestionOnNavigateSdk,
  runQuestionOnQueryChangeSdk,
} from "embedding-sdk/lib/run-question-query";
import type {
  LoadSdkQuestionParams,
  NavigateToNewCardParams,
  SdkQuestionResult,
} from "embedding-sdk/types/question";
import { useDispatch } from "metabase/lib/redux";
import type Question from "metabase-lib/v1/Question";

export function useLoadQuestion({ location, params }: LoadSdkQuestionParams) {
  const dispatch = useDispatch();

  const [result, setQuestionResult] = useState<SdkQuestionResult>({});
  const [isQuestionLoading, setIsQuestionLoading] = useState(true);

  const { question, originalQuestion, queryResults } = result;

  const storeQuestionResult = async (
    getQuestionResult: () => Promise<SdkQuestionResult | null>,
  ) => {
    setIsQuestionLoading(true);

    try {
      const nextResult = await getQuestionResult();

      if (nextResult) {
        setQuestionResult(result => ({ ...result, ...nextResult }));
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
        dispatch(runQuestionOnLoadSdk({ location, params })),
      ),
    [dispatch, location, params],
  );

  const onQuestionChange = useCallback(
    async (nextQuestion: Question) =>
      question &&
      storeQuestionResult(() =>
        dispatch(
          runQuestionOnQueryChangeSdk({
            nextQuestion,
            previousQuestion: question,
            originalQuestion,
          }),
        ),
      ),
    [dispatch, question, originalQuestion],
  );

  const onNavigateToNewCard = useCallback(
    async (params: NavigateToNewCardParams) =>
      storeQuestionResult(() =>
        dispatch(
          runQuestionOnNavigateSdk({
            ...params,
            originalQuestion,
          }),
        ),
      ),
    [dispatch, originalQuestion],
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
