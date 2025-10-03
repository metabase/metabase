import QueryVisualization from "metabase/query_builder/components/QueryVisualization";
import { Box } from "metabase/ui";
import type Question from "metabase-lib/v1/Question";
import type { Dataset, RawSeries } from "metabase-types/api";

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
    <Box pos="relative" h="20rem">
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
    </Box>
  );
}
