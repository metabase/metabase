import { useEffect, useMemo, useRef } from "react";

import { useLazyGetAdhocQueryQuery } from "metabase/api";
import * as Lib from "metabase-lib";
import Question from "metabase-lib/v1/Question";
import { normalizeParameters } from "metabase-lib/v1/parameters/utils/parameter-values";
import type { DatasetQuery } from "metabase-types/api";

import type { QueryEditorUiState } from "../../types";

export function useQueryResults(
  question: Question,
  uiState: QueryEditorUiState,
  onChangeUiState: (newUiState: QueryEditorUiState) => void,
  onRunQueryStart?: (query: DatasetQuery) => boolean | void,
) {
  const { lastRunResult, lastRunQuery } = uiState;
  const [runAdhocQuery, { isFetching: isRunning = false }] =
    useLazyGetAdhocQueryQuery();
  const abortRef = useRef<() => void>();

  const { rawSeries, isRunnable, isResultDirty } = useMemo(() => {
    const lastRunQuestion = lastRunQuery
      ? Question.create({
          dataset_query: lastRunQuery,
          metadata: question.metadata(),
          cardType: question.type(),
          display: question.display(),
          visualization_settings: question.settings(),
        })
      : null;
    const rawSeries =
      lastRunQuestion && lastRunResult
        ? [{ card: lastRunQuestion.card(), data: lastRunResult.data }]
        : null;
    const isRunnable = Lib.canRun(question.query(), question.type());
    const isResultDirty =
      lastRunQuestion == null ||
      !Lib.areLegacyQueriesEqual(
        question.datasetQuery(),
        lastRunQuestion.datasetQuery(),
      );

    return {
      rawSeries,
      isRunnable,
      isResultDirty,
    };
  }, [question, lastRunResult, lastRunQuery]);

  const runQuery = async () => {
    const lastRunQuery = question.datasetQuery();
    const shouldRunQuery = onRunQueryStart?.(lastRunQuery) !== false;
    if (!shouldRunQuery) {
      onChangeUiState({ ...uiState, lastRunResult: null, lastRunQuery });
      return;
    }
    const action = runAdhocQuery({
      ...lastRunQuery,
      parameters: normalizeParameters(question.parameters()),
    });
    abortRef.current = action.abort;
    const { data: lastRunResult = null } = await action;
    abortRef.current = undefined;

    onChangeUiState({ ...uiState, lastRunResult, lastRunQuery });
  };

  const cancelQuery = () => {
    abortRef.current?.();
    abortRef.current = undefined;
  };

  useEffect(() => {
    return () => abortRef.current?.();
  }, []);

  return {
    result: lastRunResult,
    rawSeries,
    isRunnable,
    isRunning,
    isResultDirty,
    runQuery,
    cancelQuery,
  };
}
