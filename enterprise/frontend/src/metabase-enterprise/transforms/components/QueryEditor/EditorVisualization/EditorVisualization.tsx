import DebouncedFrame from "metabase/common/components/DebouncedFrame";
import QueryVisualization from "metabase/query_builder/components/QueryVisualization";
import type Question from "metabase-lib/v1/Question";
import type { Dataset, RawSeries } from "metabase-types/api";

import S from "./EditorVisualization.module.css";

type EditorVisualizationProps = {
  question: Question;
  result: Dataset | null;
  rawSeries: RawSeries | null;
  isNative: boolean;
  isRunnable: boolean;
  isRunning: boolean;
  isResultDirty: boolean;
  onRunQuery: () => Promise<void>;
  onCancelQuery: () => void;
};

export function EditorVisualization({
  question,
  result,
  rawSeries,
  isNative,
  isRunnable,
  isRunning,
  isResultDirty,
  onRunQuery,
  onCancelQuery,
}: EditorVisualizationProps) {
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
