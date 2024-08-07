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
import { useDispatch, useSelector } from "metabase/lib/redux";
import Question from "metabase-lib/v1/Question";
import * as Urls from "metabase/lib/urls";
import { parseHash } from "metabase/query_builder/actions";
import * as Lib from "metabase-lib";
import { getMetadata } from "metabase/selectors/metadata";
import { sourceTableOrCardId } from "metabase-lib";
import { assocIn } from "icepick";

export interface LoadQuestionHookResult {
  question?: Question;
  queryResults?: any[];

  isQuestionLoading: boolean;
  isQueryRunning: boolean;

  loadQuestion(): Promise<
    SdkQuestionResult & {
      originalQuestion?: Question;
    }
  >;

  onQuestionChange(question: Question): Promise<void>;

  onNavigateToNewCard(nextCardParams: NavigateToNewCardParams): Promise<void>;
}

export function useLoadQuestion({
  cardId,
  options,
  deserializedCard,
}: LoadSdkQuestionParams): LoadQuestionHookResult {
  const dispatch = useDispatch();

  const metadata = useSelector(getMetadata);

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
        cardId,
        deserializedCard,
        options,
        cancelDeferred: deferred(),
      }),
    );

    setQuestionResult(result);

    return result;
  }, [dispatch]);

  const { originalQuestion } = loadQuestionState.value ?? {};

  const [questionChangeState, onQuestionChange] = useAsyncFn(
    async (nextQuestion: Question) => {
      if (!question) {
        return;
      }

      console.log({
        nextQuestion,
        question,
        originalQuestion,
        attempt: Lib.databaseID(nextQuestion.query()),
        queryDisplayInfo: Lib.queryDisplayInfo(nextQuestion.query()),
        dependentMetadata: Lib.dependentMetadata(
          nextQuestion.query(),
          nextQuestion.id(),
          nextQuestion.type(),
        ),
      });

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
    async (nextCardParams: NavigateToNewCardParams) => {
      const result = await dispatch(
        runQuestionOnNavigateSdk({
          ...nextCardParams,
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
