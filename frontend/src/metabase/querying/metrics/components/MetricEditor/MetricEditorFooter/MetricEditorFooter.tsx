import type { ReactNode } from "react";

import { DebouncedFrame } from "metabase/common/components/DebouncedFrame";
import type Question from "metabase-lib/v1/Question";
import type { Dataset, RawSeries } from "metabase-types/api";

import { QueryVisualization } from "../../../../components/QueryVisualization";

import S from "./MetricEditorFooter.module.css";
import { MetricEmptyState } from "./MetricEmptyState";

type MetricEditorFooterProps = {
  question: Question;
  result: Dataset | null;
  rawSeries: RawSeries | null;
  isRunnable: boolean;
  isRunning: boolean;
  isResultDirty: boolean;
  noResultsAction?: ReactNode;
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
  noResultsAction,
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
          noResultsAction={noResultsAction}
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
