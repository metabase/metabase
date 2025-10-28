import { useCallback, useMemo, useRef, useState } from "react";

import { useLazyGetAdhocQueryQuery } from "metabase/api";
import * as Lib from "metabase-lib";
import Question from "metabase-lib/v1/Question";
import { normalizeParameters } from "metabase-lib/v1/parameters/utils/parameter-values";
import type { DatasetQuery } from "metabase-types/api";

export function useQueryResults(question: Question) {
  const [lastRunQuery, setLastRunQuery] = useState<DatasetQuery | null>(null);
  const abortRef = useRef<() => void>();

  const [runAdhocQuery, { data = null, isFetching: isRunning = false }] =
    useLazyGetAdhocQueryQuery();

  const { result, rawSeries, isRunnable, isResultDirty } = useMemo(() => {
    const lastRunQuestion = lastRunQuery
      ? Question.create({
          dataset_query: lastRunQuery,
          metadata: question.metadata(),
          visualization_settings: question.settings(),
        })
      : null;
    const rawSeries =
      lastRunQuestion && data
        ? [{ card: lastRunQuestion.card(), data: data.data }]
        : null;
    const isRunnable = Lib.canRun(question.query(), question.type());
    const isResultDirty =
      lastRunQuestion == null ||
      !Lib.areLegacyQueriesEqual(
        question.datasetQuery(),
        lastRunQuestion.datasetQuery(),
      );

    return {
      result: data,
      rawSeries,
      isRunnable,
      isResultDirty,
    };
  }, [question, data, lastRunQuery]);

  const runQuery = useCallback(async () => {
    const result = runAdhocQuery({
      ...question.datasetQuery(),
      parameters: normalizeParameters(question.parameters()),
    });
    abortRef.current = result.abort;
    await result;
    setLastRunQuery(question.datasetQuery());
  }, [question, runAdhocQuery]);

  const cancelQuery = useCallback(() => {
    abortRef.current?.();
    abortRef.current = undefined;
  }, []);

  return {
    result,
    rawSeries,
    isRunnable,
    isRunning,
    isResultDirty,
    runQuery,
    cancelQuery,
  };
}
