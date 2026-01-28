import { DebouncedFrame } from "metabase/common/components/DebouncedFrame";
import { QueryVisualization } from "metabase/query_builder/components/QueryVisualization";
import type Question from "metabase-lib/v1/Question";
import type { Dataset, RawSeries } from "metabase-types/api";

import S from "./MetricEditorFooter.module.css";
import { MetricEmptyState } from "./MetricEmptyState";

type MetricEditorFooterProps = {
  question: Question;
  result: Dataset | null;
  rawSeries: RawSeries | null;
  isRunnable: boolean;
  isRunning: boolean;
  isResultDirty: boolean;
  onRunQuery: () => Promise<void>;
  onCancelQuery: () => void;
};

export function MetricEditorFooter({
  question,
  result,
  rawSeries,
  isRunnable,
  isRunning,
  isResultDirty,
  onRunQuery,
  onCancelQuery,
}: MetricEditorFooterProps) {
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
          runQuestionQuery={onRunQuery}
          cancelQuery={onCancelQuery}
        />
      ) : (
        <MetricEmptyState
          isRunnable={isRunnable}
          runQuestionQuery={onRunQuery}
        />
      )}
    </DebouncedFrame>
  );
}
