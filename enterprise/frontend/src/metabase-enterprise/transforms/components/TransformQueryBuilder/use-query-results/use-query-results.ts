import { useMemo } from "react";
import { useAsyncFn } from "react-use";

import { runQuestionQuery } from "metabase/services";
import type Question from "metabase-lib/v1/Question";

export function useQueryResults(question: Question) {
  const [{ value: results = null, loading: isRunning }, runQuery] = useAsyncFn(
    () => runQuestionQuery(question),
    [question],
  );

  const { result, rawSeries } = useMemo(() => {
    return {
      result: results ? results[0] : null,
      rawSeries:
        question && results
          ? [{ card: question.card(), data: results[0].data }]
          : null,
    };
  }, [question, results]);

  const handleRunQuery = async () => {
    await runQuery();
  };

  return { result, rawSeries, isRunning, runQuery: handleRunQuery };
}
