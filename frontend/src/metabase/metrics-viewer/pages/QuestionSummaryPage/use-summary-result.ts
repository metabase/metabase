import { useEffect, useRef, useState } from "react";

import { runQuestionQuery } from "metabase/querying/run-query";
import { useDispatch } from "metabase/redux";
import type Question from "metabase-lib/v1/Question";
import type { Dataset } from "metabase-types/api";

type ResultState = {
  question: Question;
  result?: Dataset;
  error?: unknown;
  isRunning: boolean;
};

export function useSummaryResult(question: Question, canRun: boolean) {
  const dispatch = useDispatch();
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<ResultState>({
    question,
    isRunning: false,
  });
  const controllerRef = useRef<AbortController>();

  useEffect(() => {
    if (!canRun) {
      return;
    }
    const controller = new AbortController();
    controllerRef.current = controller;
    setState({ question, isRunning: true });
    runQuestionQuery(question, {
      dispatch,
      signal: controller.signal,
      isDirty: true,
    })
      .then(([result]) => {
        if (!controller.signal.aborted) {
          setState({ question, result, isRunning: false });
        }
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setState({ question, error, isRunning: false });
        }
      });
    return () => controller.abort();
  }, [question, canRun, dispatch, revision]);

  const cancel = () => {
    controllerRef.current?.abort();
    setState({ question, isRunning: false });
  };

  return {
    result: state.question === question && canRun ? state.result : undefined,
    error: state.question === question ? state.error : undefined,
    isRunning: canRun && (state.question !== question || state.isRunning),
    refresh: () => setRevision((value) => value + 1),
    cancel,
  };
}
