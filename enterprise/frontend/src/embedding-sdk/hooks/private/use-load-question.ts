import { useRef, useState } from "react";
import { useAsyncFn, useUnmount } from "react-use";

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
import { defer, type Deferred } from "metabase/lib/promise";
import { useDispatch } from "metabase/lib/redux";
import type Question from "metabase-lib/v1/Question";

export interface LoadQuestionHookResult {
  question?: Question;
  queryResults?: any[];

  isQuestionLoading: boolean;
  isQueryRunning: boolean;

  loadQuestion(): Promise<SdkQuestionResult & { originalQuestion?: Question }>;
  onQuestionChange(question: Question): Promise<void>;
  onNavigateToNewCard(params: NavigateToNewCardParams): Promise<void>;
}

export function useLoadQuestion({
  location,
  params,
}: LoadSdkQuestionParams): LoadQuestionHookResult {
  const dispatch = useDispatch();

  // Keep track of the latest question and query results.
  // They can be updated from the below actions.
  const [result, setQuestionResult] = useState<SdkQuestionResult>({});
  const { question, queryResults } = result;

  const deferredRef = useRef<Deferred>();

  function deferred() {
    // Cancel the previous query when a new one is started.
    deferredRef.current?.resolve();
    deferredRef.current = defer();

    return deferredRef.current;
  }

  // Cancel the running query when the component unmounts.
  useUnmount(() => {
    deferredRef.current?.resolve();
  });

  const [loadQuestionState, loadQuestion] = useAsyncFn(async () => {
    const result = await dispatch(
      runQuestionOnLoadSdk({
        location,
        params,
        cancelDeferred: deferred(),
      }),
    );

    setQuestionResult(result);

    return result;
  }, [dispatch, location, params]);

  const { originalQuestion } = loadQuestionState.value ?? {};

  const [questionChangeState, onQuestionChange] = useAsyncFn(
    async (nextQuestion: Question) => {
      if (!question) {
        return;
      }

      const result = await dispatch(
        runQuestionOnQueryChangeSdk({
          nextQuestion,
          previousQuestion: question,
          originalQuestion,
          cancelDeferred: deferred(),
        }),
      );

      setQuestionResult(result);
    },
    [dispatch, question, originalQuestion],
  );

  const [navigateToNewCardState, onNavigateToNewCard] = useAsyncFn(
    async (params: NavigateToNewCardParams) => {
      const result = await dispatch(
        runQuestionOnNavigateSdk({
          ...params,
          originalQuestion,
          cancelDeferred: deferred(),
        }),
      );

      if (!result) {
        return;
      }

      setQuestionResult(result);
    },
    [dispatch, originalQuestion],
  );

  return {
    question,
    queryResults,

    isQuestionLoading: loadQuestionState.loading,
    isQueryRunning:
      questionChangeState.loading || navigateToNewCardState.loading,

    loadQuestion,
    onQuestionChange,
    onNavigateToNewCard,
  };
}
