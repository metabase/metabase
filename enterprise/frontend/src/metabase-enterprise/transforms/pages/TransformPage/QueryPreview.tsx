import { Box } from "metabase/ui";
import { useQueryEditorContext } from "metabase-enterprise/transforms/components/QueryEditor";
import { EditorVisualization } from "metabase-enterprise/transforms/components/QueryEditor/EditorVisualization";

export function QueryPreview() {
  const {
    question,
    result,
    rawSeries,
    isRunnable,
    isRunning,
    isResultDirty,
    isNative,
    runQuery,
    cancelQuery,
  } = useQueryEditorContext();

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
  )
}
