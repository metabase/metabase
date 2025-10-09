import { Box } from "metabase/ui";
import { EditorVisualization } from "metabase-enterprise/transforms/components/QueryEditor/EditorVisualization";
import type { TransformEditorValue } from "metabase-enterprise/transforms/hooks/use-transform-editor";

export function QueryPreview({
  transformEditor: {
    question,
    result,
    rawSeries,
    isRunnable,
    isRunning,
    isResultDirty,
    isNative,
    runQuery,
    cancelQuery,
  },
}: {
  transformEditor: TransformEditorValue;
}) {
  return (
    <Box pos="relative">
      <EditorVisualization
        question={question}
        result={result}
        rawSeries={rawSeries}
        isNative={isNative}
        isRunnable={isRunnable}
        isRunning={isRunning}
        isResultDirty={isResultDirty}
        onRunQuery={runQuery}
        onCancelQuery={cancelQuery}
      />
    </Box>
  );
}
