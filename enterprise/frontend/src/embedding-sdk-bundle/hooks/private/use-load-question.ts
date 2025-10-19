import { useReducer, useRef, useState } from "react";
import { useAsyncFn, useUnmount } from "react-use";

import { isStaticEntityLoadingError } from "embedding-sdk-bundle/lib/is-static-entity-loading-error";
import {
  loadQuestionSdk,
  runQuestionOnNavigateSdk,
  runQuestionQuerySdk,
  updateQuestionSdk,
} from "embedding-sdk-bundle/lib/sdk-question";
import { useSdkDispatch, useSdkSelector } from "embedding-sdk-bundle/store";
import { setError } from "embedding-sdk-bundle/store/reducer";
import { getIsStaticEmbedding } from "embedding-sdk-bundle/store/selectors";
import type {
  LoadSdkQuestionParams,
  NavigateToNewCardParams,
  SdkQuestionState,
  SqlParameterValues,
} from "embedding-sdk-bundle/types/question";
import { type Deferred, defer } from "metabase/lib/promise";
import { setEmbedQuestionEndpoints } from "metabase/services";
import type Question from "metabase-lib/v1/Question";
import type { ParameterValuesMap } from "metabase-types/api";
import { isObject } from "metabase-types/guards";

type LoadQuestionResult = Promise<
  SdkQuestionState & { originalQuestion?: Question }
>;

export interface LoadQuestionHookResult {
  question?: Question;
  originalQuestion?: Question;
  parameterValues?: ParameterValuesMap;

  queryResults?: any[];

  isQuestionLoading: boolean;
  isQueryRunning: boolean;

  queryQuestion(): Promise<Question | undefined>;

  loadAndQueryQuestion(): LoadQuestionResult;

  updateQuestion(
    question: Question,
    options?: { run?: boolean },
  ): Promise<void>;
  updateParameterValues(parameterValues: ParameterValuesMap): Promise<void>;

  /**
   * Replaces both the question and originalQuestion object directly.
   * Unlike updateQuestion, this does not turn the question into an ad-hoc question.
   */
  replaceQuestion(question: Question): void;

  navigateToNewCard:
    | ((params: NavigateToNewCardParams) => Promise<void>)
    | null;
}

export function useLoadQuestion({
  questionId,
  token,
  originalCardId,
  options,
  // Passed when navigating from `InteractiveDashboard` or `EditableDashboard`
  deserializedCard,
  initialSqlParameters,
  targetDashboardId,
}: LoadSdkQuestionParams): LoadQuestionHookResult {
  const dispatch = useSdkDispatch();

  // Keep track of the latest question and query results.
  // They can be updated from the below actions.
  const [questionState, mergeQuestionState] = useReducer(questionReducer, {});
  const { question, originalQuestion, queryResults, parameterValues } =
    questionState;

  const isStaticEmbedding = useSdkSelector(getIsStaticEmbedding);

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

  const shouldLoadQuestion = questionId != null || deserializedCard != null;
  const [isQuestionLoading, setIsQuestionLoading] =
    useState(shouldLoadQuestion);

  const [, loadAndQueryQuestion] = useAsyncFn(async () => {
    if (shouldLoadQuestion) {
      setIsQuestionLoading(true);
    }

    try {
      if (isStaticEmbedding) {
        setEmbedQuestionEndpoints(token ?? "");
      }

      const questionState = await dispatch(
        loadQuestionSdk({
          options,
          deserializedCard,
          questionId,
          token,
          originalCardId,
          initialSqlParameters,
          targetDashboardId,
        }),
      );

      mergeQuestionState(questionState);

      const results = await runQuestionQuerySdk({
        question: questionState.question,
        isStaticEmbedding,
        originalQuestion: questionState.originalQuestion,
        originalCardId,
        parameterValues: questionState.parameterValues,
        cancelDeferred: deferred(),
      });

      mergeQuestionState(results);

      setIsQuestionLoading(false);
      return { ...results, originalQuestion };
    } catch (err) {
      // Ignore cancelled requests (e.g. when the component unmounts).
      // React simulates unmounting on strict mode, therefore "Question not found" will be shown without this.
      if (isCancelledRequestError(err)) {
        return {};
      }

      if (isStaticEntityLoadingError(err)) {
        dispatch(
          setError({
            status: err.status,
            message: err.data,
          }),
        );
      }

      mergeQuestionState({
        question: undefined,
        originalQuestion: undefined,
        queryResults: undefined,
        parameterValues: undefined,
      });

      setIsQuestionLoading(false);
      return {};
    }
  }, [
    dispatch,
    options,
    originalCardId,
    deserializedCard,
    isStaticEmbedding,
    sqlParameterKey,
    questionId,
    token,
    targetDashboardId,
  ]);

  const [runQuestionState, queryQuestion] = useAsyncFn(async () => {
    if (!question) {
      return;
    }

    const state = await runQuestionQuerySdk({
      question,
      isStaticEmbedding,
      originalQuestion,
      originalCardId,
      parameterValues,
      cancelDeferred: deferred(),
    });

    mergeQuestionState(state);

    return state.question;
  }, [
    dispatch,
    question,
    isStaticEmbedding,
    originalQuestion,
    originalCardId,
    parameterValues,
  ]);

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
          originalCardId,
          nextParameterValues: parameterValues ?? {},
          cancelDeferred: deferred(),
          optimisticUpdateQuestion: (question) =>
            mergeQuestionState({ question }),
          shouldRunQueryOnQuestionChange: run,
          shouldStartAdHocQuestion: true,
          isStaticEmbedding,
        }),
      );

      mergeQuestionState(state);
    },
    [
      dispatch,
      question,
      originalQuestion,
      originalCardId,
      parameterValues,
      isStaticEmbedding,
    ],
  );

  const [updateParameterValuesState, updateParameterValues] = useAsyncFn(
    async (nextParameterValues: ParameterValuesMap) => {
      if (!question) {
        return;
      }

      mergeQuestionState({
        parameterValues: nextParameterValues,
      });

      const state = await dispatch(
        updateQuestionSdk({
          nextQuestion: question,
          previousQuestion: question,
          originalQuestion,
          originalCardId,
          nextParameterValues,
          cancelDeferred: deferred(),
          optimisticUpdateQuestion: (question) =>
            mergeQuestionState({ question }),
          shouldRunQueryOnQuestionChange: true,
          shouldStartAdHocQuestion: false,
          isStaticEmbedding,
        }),
      );

      mergeQuestionState(state);
    },
    [
      dispatch,
      question,
      originalQuestion,
      originalCardId,
      parameterValues,
      isStaticEmbedding,
    ],
  );

  const [navigateToNewCardState, navigateToNewCard] = useAsyncFn(
    async (params: NavigateToNewCardParams) => {
      const state = await dispatch(
        runQuestionOnNavigateSdk({
          ...params,
          isStaticEmbedding,
          originalQuestion,
          originalCardId,
          parameterValues,
          cancelDeferred: deferred(),
          onQuestionChange: (question) => mergeQuestionState({ question }),
          onClearQueryResults: () =>
            mergeQuestionState({ queryResults: [null] }),
        }),
      );
      if (!state) {
        return;
      }

      mergeQuestionState(state);
    },
    [
      dispatch,
      originalQuestion,
      originalCardId,
      isStaticEmbedding,
      parameterValues,
    ],
  );

  const isQueryRunning =
    runQuestionState.loading ||
    updateQuestionState.loading ||
    updateParameterValuesState.loading ||
    navigateToNewCardState.loading;

  const replaceQuestion = (question: Question) =>
    mergeQuestionState({ question, originalQuestion: question });

  return {
    question,
    originalQuestion,
    parameterValues,

    queryResults,

    isQuestionLoading,
    isQueryRunning,

    queryQuestion,
    replaceQuestion,
    loadAndQueryQuestion,
    updateQuestion,
    updateParameterValues,
    navigateToNewCard,
  };
}

const questionReducer = (state: SdkQuestionState, next: SdkQuestionState) => ({
  ...state,
  ...next,
});

export const getParameterDependencyKey = (
  parameters?: SqlParameterValues,
): string =>
  Object.entries(parameters ?? {})
    .sort(([keyA], [keyB]) => keyA.localeCompare(keyB))
    .map(([key, value]) => `${key}=${value}`)
    .join(":");

const isCancelledRequestError = (error: unknown) =>
  isObject(error) && "isCancelled" in error && error.isCancelled === true;
