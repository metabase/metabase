import QueryVisualization from "metabase/query_builder/components/QueryVisualization";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import type { Dataset, RawSeries } from "metabase-types/api";

import { MetricEditorEmptyState } from "./MetricEditorEmptyState";

type MetricEditorFooterProps = {
  question: Question;
  result: Dataset | null;
  rawSeries: RawSeries | null;
  isRunning: boolean;
  isResultDirty: boolean;
  runQuestionQuery: () => Promise<void>;
  cancelQuery: () => void;
};

export function MetricEditorFooter({
  question,
  result,
  rawSeries,
  isRunning,
  isResultDirty,
  runQuestionQuery,
}: MetricEditorFooterProps) {
  const isRunnable = Lib.canRun(question.query(), "metric");

  if (!result && !isRunning) {
    return (
      <MetricEditorEmptyState
        isRunnable={isRunnable}
        runQuestionQuery={runQuestionQuery}
      />
    );
  }

  return (
    <QueryVisualization
      question={question}
      result={result}
      rawSeries={rawSeries}
      isRunnable={isRunnable}
      isRunning={isRunning}
      isResultDirty={isResultDirty}
      runQuestionQuery={runQuestionQuery}
    />
  );
}
