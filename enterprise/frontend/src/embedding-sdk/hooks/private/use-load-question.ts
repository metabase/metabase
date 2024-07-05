import { useCallback, useState } from "react";

import {
  runQuestionOnLoadSdk,
  runQuestionOnQueryChangeSdk,
  runQuestionOnNavigateSdk,
} from "embedding-sdk/lib/interactive-question";
import type {
  LoadSdkQuestionParams,
  NavigateToNewCardParams,
  SdkQuestionResult,
} from "embedding-sdk/types/question";
import { useDispatch } from "metabase/lib/redux";
import type Question from "metabase-lib/v1/Question";

export interface LoadQuestionHookResult {
  question?: Question;
  queryResults?: any[];
  isQuestionLoading: boolean;
  isQueryRunning: boolean;

  loadQuestion(): Promise<void>;
  onQuestionChange(question: Question): Promise<void>;
  onNavigateToNewCard(params: NavigateToNewCardParams): Promise<void>;
}

export function useLoadQuestion({
  location,
  params,
}: LoadSdkQuestionParams): LoadQuestionHookResult {
  const dispatch = useDispatch();

  const [result, setQuestionResult] = useState<SdkQuestionResult>({});

  // Loading state for initial question load.
  const [isQuestionLoading, setIsQuestionLoading] = useState(true);

  // Loading state for subsequent query runs; either query change or navigating to new card.
  const [isQueryRunning, setIsQueryRunning] = useState(false);

  const { question, originalQuestion, queryResults } = result;

  const storeQuestionResult = async (
    getQuestionResult: () => Promise<SdkQuestionResult | null>,
  ) => {
    setIsQueryRunning(true);

    try {
      const nextResult = await getQuestionResult();

      if (nextResult) {
        setQuestionResult(result => ({ ...result, ...nextResult }));
      }
    } catch (e) {
      console.error(`Failed to update question result`, e);
    } finally {
      setIsQueryRunning(false);
    }
  };

  const loadQuestion = useCallback(async () => {
    setIsQuestionLoading(true);

    try {
      const nextResult = await dispatch(
        runQuestionOnLoadSdk({ location, params }),
      );

      if (nextResult) {
        setQuestionResult(result => ({ ...result, ...nextResult }));
      }
    } catch (e) {
      console.error(`Failed to update question result`, e);
    } finally {
      setIsQuestionLoading(false);
    }
  }, [dispatch, location, params]);

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
    isQueryRunning,

    loadQuestion,
    onQuestionChange,
    onNavigateToNewCard,
  };
}
