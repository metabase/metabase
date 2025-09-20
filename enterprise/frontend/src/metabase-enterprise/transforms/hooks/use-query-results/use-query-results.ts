import { useCallback, useMemo, useState } from "react";
import { useAsyncFn } from "react-use";

import { useSelector } from "metabase/lib/redux";
import { getMetadata } from "metabase/selectors/metadata";
import { runQuestionQuery } from "metabase/services";
import * as Lib from "metabase-lib";
import Question from "metabase-lib/v1/Question";
import type { DatasetQuery } from "metabase-types/api";

export function useQueryResults(
  question: Question,
  proposedQuestion?: Question,
) {
  const metadata = useSelector(getMetadata);
  const [lastRunQuery, setLastRunQuery] = useState<DatasetQuery | null>(null);

  const currentQuestion = proposedQuestion ?? question;

  const [{ value: results = null, loading: isRunning }, runQuery] = useAsyncFn(
    () => runQuestionQuery(currentQuestion),
    [currentQuestion],
  );

  const { result, rawSeries, isRunnable, isResultDirty } = useMemo(() => {
    const lastRunQuestion = lastRunQuery
      ? Question.create({ dataset_query: lastRunQuery, metadata })
      : null;
    const result = results ? results[0] : null;
    const rawSeries =
      lastRunQuestion && result
        ? [{ card: lastRunQuestion.card(), data: result.data }]
        : null;
    const isRunnable = Lib.canRun(
      currentQuestion.query(),
      currentQuestion.type(),
    );
    const isResultDirty =
      lastRunQuestion == null ||
      currentQuestion.isDirtyComparedTo(lastRunQuestion);

    return {
      result,
      rawSeries,
      isRunnable,
      isResultDirty,
    };
  }, [currentQuestion, results, metadata, lastRunQuery]);

  const handleRunQuery = useCallback(async () => {
    await runQuery();
    setLastRunQuery(currentQuestion.datasetQuery());
  }, [currentQuestion, runQuery]);

  const handleCancelQuery = useCallback(() => {
    return null;
  }, []);

  return {
    result,
    rawSeries,
    isRunnable,
    isRunning,
    isResultDirty,
    runQuery: handleRunQuery,
    cancelQuery: handleCancelQuery,
  };
}
