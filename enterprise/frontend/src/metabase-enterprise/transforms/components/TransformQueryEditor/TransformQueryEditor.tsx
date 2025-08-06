import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { Flex } from "metabase/ui";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import type { DatasetQuery } from "metabase-types/api";

import { EditorBody } from "./EditorBody";
import { EditorHeader } from "./EditorHeader";
import { EditorVisualization } from "./EditorVisualization";
import S from "./TransformQueryEditor.module.css";
import { useQueryMetadata } from "./use-query-metadata";
import { useQueryResults } from "./use-query-results";
import { useQueryState } from "./use-query-state";

type TransformQueryEditorProps = {
  query: DatasetQuery;
  isNew?: boolean;
  isSaving?: boolean;
  onSave: (newQuery: DatasetQuery) => void;
  onCancel: () => void;
};

export function TransformQueryEditor({
  query: initialQuery,
  isNew = true,
  isSaving = false,
  onSave,
  onCancel,
}: TransformQueryEditorProps) {
  const { question, setQuestion } = useQueryState(initialQuery);
  const { isInitiallyLoaded } = useQueryMetadata(question);
  const {
    result,
    rawSeries,
    isRunnable,
    isRunning,
    isResultDirty,
    runQuery,
    cancelQuery,
  } = useQueryResults(question);
  const canSave = Lib.canSave(question.query(), question.type());
  const { isNative } = Lib.queryDisplayInfo(question.query());

  const handleChange = async (newQuestion: Question) => {
    setQuestion(newQuestion);
  };

  const handleSave = () => {
    onSave(question.datasetQuery());
  };

  if (!isInitiallyLoaded) {
    return <LoadingAndErrorWrapper loading />;
  }

  return (
    <Flex className={S.root} w="100%" h="100%" direction="column" bg="bg-white">
      <EditorHeader
        canSave={canSave}
        isNew={isNew}
        isSaving={isSaving}
        onSave={handleSave}
        onCancel={onCancel}
      />
      <EditorBody
        question={question}
        isNative={isNative}
        isRunnable={isRunnable}
        isRunning={isRunning}
        isResultDirty={isResultDirty}
        onChange={handleChange}
        onRunQuery={runQuery}
        onCancelQuery={cancelQuery}
      />
      <EditorVisualization
        question={question}
        result={result}
        rawSeries={rawSeries}
        isNative={isNative}
        isRunnable={isRunnable}
        isRunning={isRunning}
        isResultDirty={isResultDirty}
        onRunQuery={runQuery}
        onCancelQuery={() => undefined}
      />
    </Flex>
  );
}
