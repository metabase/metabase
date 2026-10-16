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

type BlockResult = {
  requestKey: string;
  series: BlockSeries | null;
  error: BlockError | null;
};

type ResultState = {
  /** The request that is running, or last ran. */
  requestKey: string;
  isRunning: boolean;
  result: BlockResult | null;
};

// Rebuilding a query mints new clause ids, which don't change the request.
function omitClauseIds(key: string, value: unknown) {
  return key === "lib/uuid" ? undefined : value;
}

/**
 * Identifies the request `runQuestionQuery` would send, so settings-only
 * updates (e.g. moving a block, or column widths a pivot table writes back on
 * render) reuse the current result instead of re-running the query.
 */
export function getRequestKey(question: Question | null): string {
  if (question == null) {
    return "";
  }
  return JSON.stringify(
    {
      datasetQuery: question.datasetQuery(),
      parameters: normalizeParameters(question.parameters()),
      pivotOptions: shouldUsePivotEndpoint(question)
        ? getPivotOptions(question)
        : null,
    },
    omitClauseIds,
  );
}

/**
 * Runs a summary block's question whenever its query changes or `refreshKey` bumps.
 * While a new request runs, the previous result stays available, rendered with the
 * card it was run for. Pass `null` when the block can't run yet.
 */
export function useBlockResult(question: Question | null, refreshKey: number) {
  const dispatch = useDispatch();
  const [revision, setRevision] = useState(0);
  const requestKey = useMemo(() => getRequestKey(question), [question]);
  const latestQuestion = useLatest(question);
  const [state, setState] = useState<ResultState>({
    requestKey,
    isRunning: false,
    result: null,
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
    const finish = (result: BlockResult) => {
      if (!controller.signal.aborted) {
        setState({ requestKey, isRunning: false, result });
      }
    };
    runQuestionQuery(currentQuestion, {
      dispatch,
      signal: controller.signal,
      isDirty: true,
    })
      .then(([dataset]) =>
        finish({
          requestKey,
          series: { card: currentQuestion.card(), data: dataset.data },
          error: getDatasetError(dataset) ?? null,
        }),
      )
      .catch(() =>
        finish({
          requestKey,
          series: null,
          error: { message: getGenericErrorMessage(), icon: "warning" },
        }),
      );
    return () => controller.abort();
  }, [requestKey, dispatch, revision, refreshKey, latestQuestion]);

  const cancel = () => {
    controllerRef.current?.abort();
    setState((state) => ({ ...state, isRunning: false }));
  };

  const { result } = state;
  const isResultCurrent = result != null && result.requestKey === requestKey;
  const latestCard = question?.card();
  const series =
    result?.series != null && isResultCurrent && latestCard != null
      ? // settings-only changes keep the result but render with the latest settings
        { ...result.series, card: latestCard }
      : (result?.series ?? null);

  return {
    series,
    error: isResultCurrent ? result.error : null,
    isRunning: canRun && (state.requestKey !== requestKey || state.isRunning),
    refresh: () => setRevision((value) => value + 1),
    cancel,
  };
}
