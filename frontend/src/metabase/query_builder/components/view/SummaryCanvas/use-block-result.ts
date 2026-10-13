import { useEffect, useMemo, useRef, useState } from "react";
import { useLatest } from "react-use";

import { shouldUsePivotEndpoint } from "metabase/querying/api/query-endpoints";
import { runQuestionQuery } from "metabase/querying/run-query";
import { useDispatch } from "metabase/redux";
import { getDatasetError, getGenericErrorMessage } from "metabase/viz-core";
import type Question from "metabase-lib/v1/Question";
import { normalizeParameters } from "metabase-lib/v1/parameters/utils/parameter-values";
import { getPivotOptions } from "metabase-lib/v1/queries/utils/pivot-options";
import type { Card, Dataset, IconName } from "metabase-types/api";

/** A result and the card it was run for, so a stale result always renders with matching settings. */
export type BlockSeries = { card: Card; data: Dataset["data"] };

export type BlockError = { message: string; icon: IconName };

type ResultState = {
  requestKey: string;
  series: BlockSeries | null;
  error: BlockError | null;
  isRunning: boolean;
};

/**
 * Identifies the request `runQuestionQuery` would send, so settings-only
 * updates (e.g. column widths a pivot table writes back on render) reuse the
 * current result instead of re-running the query.
 */
function getRequestKey(question: Question | null): string {
  if (question == null) {
    return "";
  }
  return JSON.stringify({
    datasetQuery: question.datasetQuery(),
    parameters: normalizeParameters(question.parameters()),
    pivotOptions: shouldUsePivotEndpoint(question)
      ? getPivotOptions(question)
      : null,
  });
}

/**
 * Runs a summary block's question whenever its query changes or `refreshKey` bumps.
 * While a new request runs, the previous result stays available as a stale series.
 * Pass `null` when the block can't run yet.
 */
export function useBlockResult(question: Question | null, refreshKey: number) {
  const dispatch = useDispatch();
  const [revision, setRevision] = useState(0);
  const requestKey = useMemo(() => getRequestKey(question), [question]);
  const latestQuestion = useLatest(question);
  const [state, setState] = useState<ResultState>({
    requestKey,
    series: null,
    error: null,
    isRunning: false,
  });
  const controllerRef = useRef<AbortController>();
  const canRun = question != null;

  useEffect(() => {
    const currentQuestion = latestQuestion.current;
    if (currentQuestion == null) {
      return;
    }
    const controller = new AbortController();
    controllerRef.current = controller;
    setState((state) => ({ ...state, requestKey, isRunning: true }));
    runQuestionQuery(currentQuestion, {
      dispatch,
      signal: controller.signal,
      isDirty: true,
    })
      .then(([result]) => {
        if (!controller.signal.aborted) {
          setState({
            requestKey,
            series: { card: currentQuestion.card(), data: result.data },
            error: getDatasetError(result) ?? null,
            isRunning: false,
          });
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setState({
            requestKey,
            series: null,
            error: { message: getGenericErrorMessage(), icon: "warning" },
            isRunning: false,
          });
        }
      });
    return () => controller.abort();
  }, [requestKey, dispatch, revision, refreshKey, latestQuestion]);

  const cancel = () => {
    controllerRef.current?.abort();
    setState((state) => ({ ...state, isRunning: false }));
  };

  const isCurrent = state.requestKey === requestKey;
  const latestCard = question?.card();

  return {
    // settings-only changes keep the result but should render with the latest settings
    series:
      state.series != null && isCurrent && latestCard != null
        ? { ...state.series, card: latestCard }
        : state.series,
    error: isCurrent ? state.error : null,
    isRunning: canRun && (!isCurrent || state.isRunning),
    refresh: () => setRevision((value) => value + 1),
    cancel,
  };
}
