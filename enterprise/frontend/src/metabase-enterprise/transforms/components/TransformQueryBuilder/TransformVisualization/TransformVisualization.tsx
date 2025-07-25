import DebouncedFrame from "metabase/common/components/DebouncedFrame";
import QueryVisualization from "metabase/query_builder/components/QueryVisualization";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import type { Dataset, RawSeries } from "metabase-types/api";

import S from "./TransformVisualization.module.css";

type TransformVisualizationProps = {
  question: Question;
  result: Dataset | null;
  rawSeries: RawSeries | null;
  isRunnable: boolean;
  isRunning: boolean;
  isResultDirty: boolean;
  onRunQuery: () => Promise<void>;
  onCancelQuery: () => void;
};

export function TransformVisualization({
  question,
  result,
  rawSeries,
  isRunnable,
  isRunning,
  isResultDirty,
  onRunQuery,
  onCancelQuery,
}: TransformVisualizationProps) {
  const query = question.query();
  const { isNative } = Lib.queryDisplayInfo(query);

  return (
    <DebouncedFrame className={S.root}>
      <QueryVisualization
        question={question}
        result={result}
        rawSeries={rawSeries}
        isRunnable={isRunnable}
        isRunning={isRunning}
        isDirty
        isResultDirty={isResultDirty}
        isNativeEditorOpen={isNative}
        runQuestionQuery={onRunQuery}
        cancelQuery={onCancelQuery}
      />
    </DebouncedFrame>
  );
}
