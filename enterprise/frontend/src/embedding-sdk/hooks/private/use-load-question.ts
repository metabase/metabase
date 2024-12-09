import { useReducer, useRef } from "react";
import { useAsyncFn, useUnmount } from "react-use";

import type { ParameterValues } from "embedding-sdk/components/private/InteractiveQuestion/context";
import {
  runQuestionOnLoadSdk,
  runQuestionOnNavigateSdk,
  updateQuestionSdk,
} from "embedding-sdk/lib/interactive-question";
import { runQuestionQuerySdk } from "embedding-sdk/lib/interactive-question/run-question-query";
import { useSdkDispatch } from "embedding-sdk/store";
import type {
  LoadSdkQuestionParams,
  NavigateToNewCardParams,
  SdkQuestionState,
} from "embedding-sdk/types/question";
import { type Deferred, defer } from "metabase/lib/promise";
import type Question from "metabase-lib/v1/Question";

type LoadQuestionResult = Promise<
  SdkQuestionState & { originalQuestion?: Question }
>;

export interface LoadQuestionHookResult {
  question?: Question;
  originalQuestion?: Question;

  queryResults?: any[];

  isQuestionLoading: boolean;
  isQueryRunning: boolean;

  runQuestion(): Promise<void>;

  loadQuestion(): LoadQuestionResult;

  updateQuestion(
    question: Question,
    options?: { run?: boolean },
  ): Promise<void>;

  /**
   * Replaces both the question and originalQuestion object directly.
   * Unlike updateQuestion, this does not turn the question into an ad-hoc question.
   */
  replaceQuestion(question: Question): void;

  navigateToNewCard(params: NavigateToNewCardParams): Promise<void>;
}

export function useLoadQuestion({
  cardId,
  options,
  deserializedCard,
  initialSqlParameters,
}: LoadSdkQuestionParams): LoadQuestionHookResult {
  const dispatch = useSdkDispatch();

  // Keep track of the latest question and query results.
  // They can be updated from the below actions.
  const [questionState, setQuestionState] = useReducer(questionReducer, {});
  const { question, originalQuestion, queryResults } = questionState;

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

  // Avoid re-running the query if the parameters haven't changed.
  const sqlParameterKey = getParameterDependencyKey(initialSqlParameters);

  const [loadQuestionState, loadQuestion] = useAsyncFn(async () => {
    const state = await dispatch(
      runQuestionOnLoadSdk({
        options,
        deserializedCard,
        cardId,
        cancelDeferred: deferred(),
        initialSqlParameters,
      }),
    );

    setQuestionState(state);

    return state;
  }, [dispatch, options, deserializedCard, cardId, sqlParameterKey]);

  const [runQuestionState, runQuestion] = useAsyncFn(async () => {
    if (!question) {
      return;
    }

    const state = await runQuestionQuerySdk({
      question,
      originalQuestion,
      cancelDeferred: deferred(),
    });

    setQuestionState(state);
  }, [dispatch, question, originalQuestion]);

  const [updateQuestionState, updateQuestion] = useAsyncFn(
    async (nextQuestion: Question, options: { run?: boolean }) => {
      const { run = false } = options ?? {};

      if (!question) {
        return;
      }

      const state = await dispatch(
        updateQuestionSdk({
          nextQuestion,
          previousQuestion: question,
          originalQuestion,
          cancelDeferred: deferred(),
          optimisticUpdateQuestion: question => setQuestionState({ question }),
          shouldRunQueryOnQuestionChange: run,
        }),
      );

      setQuestionState(state);
    },
    [dispatch, question, originalQuestion],
  );

  const [navigateToNewCardState, navigateToNewCard] = useAsyncFn(
    async (params: NavigateToNewCardParams) => {
      const state = await dispatch(
        runQuestionOnNavigateSdk({
          ...params,
          originalQuestion,
          cancelDeferred: deferred(),
          onQuestionChange: question => setQuestionState({ question }),
          onClearQueryResults: () => setQuestionState({ queryResults: [null] }),
        }),
      );

      if (!state) {
        return;
      }

      setQuestionState(state);
    },
    [dispatch, originalQuestion],
  );

  const isQueryRunning =
    runQuestionState.loading ||
    updateQuestionState.loading ||
    navigateToNewCardState.loading;

  const replaceQuestion = (question: Question) =>
    setQuestionState({ question, originalQuestion: question });

  return {
    question,
    originalQuestion,

    queryResults,

    isQuestionLoading: loadQuestionState.loading,
    isQueryRunning,

    runQuestion,
    replaceQuestion,
    loadQuestion,
    updateQuestion,
    navigateToNewCard,
  };
}

const questionReducer = (state: SdkQuestionState, next: SdkQuestionState) => ({
  ...state,
  ...next,
});

export const getParameterDependencyKey = (
  parameters?: ParameterValues,
): string =>
  Object.entries(parameters ?? {})
    .sort(([keyA], [keyB]) => keyA.localeCompare(keyB))
    .map(([key, value]) => `${key}=${value}`)
    .join(":");
