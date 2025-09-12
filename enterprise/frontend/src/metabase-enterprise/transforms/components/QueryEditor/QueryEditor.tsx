import { useHotkeys } from "@mantine/hooks";

import { useListDatabasesQuery } from "metabase/api";
import { Center, Flex, Loader } from "metabase/ui";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import type { DatasetQuery, Transform } from "metabase-types/api";

import { useQueryMetadata } from "../../hooks/use-query-metadata";
import { useQueryResults } from "../../hooks/use-query-results";
import { useQueryState } from "../../hooks/use-query-state";

import { EditorBody } from "./EditorBody";
import { EditorHeader } from "./EditorHeader";
import { EditorVisualization } from "./EditorVisualization";
import S from "./QueryEditor.module.css";

type QueryEditorProps = {
  transform?: Transform;
  initialQuery: DatasetQuery;
  proposedQuery?: DatasetQuery;
  isNew?: boolean;
  isSaving?: boolean;
  onSave: (newQuery: DatasetQuery) => void;
  onChange?: (newQuery: DatasetQuery) => void;
  onCancel: () => void;
  onRejectProposed?: () => void;
  onAcceptProposed?: (query: DatasetQuery) => void;
};

export function QueryEditor({
  initialQuery,
  proposedQuery,
  transform,
  isNew = true,
  isSaving = false,
  onSave,
  onChange,
  onCancel,
  onRejectProposed,
  onAcceptProposed,
}: QueryEditorProps) {
  const { question, proposedQuestion, isQueryDirty, setQuestion } =
    useQueryState(initialQuery, proposedQuery);
  const { isInitiallyLoaded } = useQueryMetadata(question);
  const {
    result,
    rawSeries,
    isRunnable,
    isRunning,
    isResultDirty,
    runQuery,
    cancelQuery,
  } = useQueryResults(question, proposedQuestion);
  const canSave = Lib.canSave(question.query(), question.type());
  const { isNative } = Lib.queryDisplayInfo(question.query());

  const handleChange = async (newQuestion: Question) => {
    setQuestion(newQuestion);
    onChange?.(newQuestion.datasetQuery());
  };

  const handleSave = () => {
    onSave(question.datasetQuery());
  };

  const handleCmdEnter = () => {
    if (isRunning) {
      cancelQuery();
    } else if (isRunnable) {
      runQuery();
    }
  };

  useHotkeys([["mod+Enter", handleCmdEnter]], []);

  const { data: databases, isLoading } = useListDatabasesQuery({
    include_analytics: true,
  });

  if (!isInitiallyLoaded || isLoading) {
    return (
      <Center>
        <Loader />
      </Center>
    );
  }

  return (
    <Flex
      className={S.root}
      w="100%"
      h="100%"
      direction="column"
      bg="bg-white"
      data-testid="transform-query-editor"
    >
      <EditorHeader
        name={transform?.name}
        isNew={isNew}
        isSaving={isSaving}
        canSave={canSave && (isNew || isQueryDirty)}
        onSave={handleSave}
        onCancel={onCancel}
      />
      <EditorBody
        question={question}
        proposedQuestion={proposedQuestion}
        isNative={isNative}
        isRunnable={isRunnable}
        isRunning={isRunning}
        isResultDirty={isResultDirty}
        onChange={handleChange}
        onRunQuery={runQuery}
        onCancelQuery={cancelQuery}
        databases={databases?.data ?? []}
        onRejectProposed={onRejectProposed}
        onAcceptProposed={onAcceptProposed}
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
