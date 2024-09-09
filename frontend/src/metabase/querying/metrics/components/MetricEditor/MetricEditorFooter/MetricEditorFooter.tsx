import DebouncedFrame from "metabase/components/DebouncedFrame";
import QueryVisualization from "metabase/query_builder/components/QueryVisualization";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import type { Dataset, RawSeries } from "metabase-types/api";

import S from "./MetricEditorFooter.module.css";
import { MetricEmptyState } from "./MetricEmptyState";

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

  return (
    <DebouncedFrame className={S.root}>
      {result != null || isRunning ? (
        <QueryVisualization
          question={question}
          result={result}
          rawSeries={rawSeries}
          isRunnable={isRunnable}
          isRunning={isRunning}
          isResultDirty={isResultDirty}
          runQuestionQuery={runQuestionQuery}
        />
      ) : (
        <MetricEmptyState
          isRunnable={isRunnable}
          runQuestionQuery={runQuestionQuery}
        />
      )}
    </DebouncedFrame>
  );
}
