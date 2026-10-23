import { useEffect, useMemo, useRef, useState } from "react";
import { useLatest } from "react-use";

import { shouldUsePivotEndpoint } from "metabase/querying/api/query-endpoints";
import { runQuestionQuery } from "metabase/querying/run-query";
import { useDispatch } from "metabase/redux";
import type Question from "metabase-lib/v1/Question";
import { normalizeParameters } from "metabase-lib/v1/parameters/utils/parameter-values";
import { getPivotOptions } from "metabase-lib/v1/queries/utils/pivot-options";
import type { Dataset } from "metabase-types/api";

type ResultState = {
  requestKey: string;
  result?: Dataset;
  error?: unknown;
  isRunning: boolean;
};

/**
 * Identifies the request `runQuestionQuery` would send, so settings-only
 * updates (e.g. column widths a pivot table writes back on render) reuse the
 * current result instead of re-running the query.
 */
function getRequestKey(question: Question): string {
  return JSON.stringify({
    datasetQuery: question.datasetQuery(),
    parameters: normalizeParameters(question.parameters()),
    pivotOptions: shouldUsePivotEndpoint(question)
      ? getPivotOptions(question)
      : null,
  });
}

export function useSummaryResult(question: Question, canRun: boolean) {
  const dispatch = useDispatch();
  const [revision, setRevision] = useState(0);
  const requestKey = useMemo(() => getRequestKey(question), [question]);
  const latestQuestion = useLatest(question);
  const [state, setState] = useState<ResultState>({
    requestKey,
    isRunning: false,
  });
  const controllerRef = useRef<AbortController>();

  useEffect(() => {
    if (!canRun) {
      return;
    }
    const controller = new AbortController();
    controllerRef.current = controller;
    setState({ requestKey, isRunning: true });
    runQuestionQuery(latestQuestion.current, {
      dispatch,
      signal: controller.signal,
      isDirty: true,
    })
      .then(([result]) => {
        if (!controller.signal.aborted) {
          setState({ requestKey, result, isRunning: false });
        }
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setState({ requestKey, error, isRunning: false });
        }
      });
    return () => controller.abort();
  }, [requestKey, canRun, dispatch, revision, latestQuestion]);

  const cancel = () => {
    controllerRef.current?.abort();
    setState({ requestKey, isRunning: false });
  };

  const isCurrent = state.requestKey === requestKey;

  return {
    result: isCurrent && canRun ? state.result : undefined,
    error: isCurrent ? state.error : undefined,
    isRunning: canRun && (!isCurrent || state.isRunning),
    refresh: () => setRevision((value) => value + 1),
    cancel,
  };
}
