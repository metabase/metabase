import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { Flex } from "metabase/ui";
import type Question from "metabase-lib/v1/Question";
import type { DatasetQuery } from "metabase-types/api";

import { TransformHeader } from "./TransformHeader";
import S from "./TransformQueryBuilder.module.css";
import { TransformQueryEditor } from "./TransformQueryEditor";
import { TransformVisualization } from "./TransformVisualization";
import { useQueryMetadata } from "./use-query-metadata";
import { useQueryResults } from "./use-query-results";
import { useQueryState } from "./use-query-state";

type TransformQueryBuilderProps = {
  name?: string;
  query: DatasetQuery;
  isSaving?: boolean;
  onSave: (newQuery: DatasetQuery) => void;
  onCancel: () => void;
};

export function TransformQueryBuilder({
  name,
  query: initialQuery,
  isSaving,
  onSave,
  onCancel,
}: TransformQueryBuilderProps) {
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
    <Flex className={S.root} direction="column" flex="1 1 0" bg="bg-white">
      <TransformHeader
        name={name}
        isSaving={isSaving}
        onSave={handleSave}
        onCancel={onCancel}
      />
      <TransformQueryEditor
        question={question}
        isRunnable={isRunnable}
        isRunning={isRunning}
        isResultDirty={isResultDirty}
        onChange={handleChange}
        onRunQuery={runQuery}
        onCancelQuery={cancelQuery}
      />
      <TransformVisualization
        question={question}
        result={result}
        rawSeries={rawSeries}
        isRunnable={isRunnable}
        isRunning={isRunning}
        isResultDirty={isResultDirty}
        onRunQuery={runQuery}
        onCancelQuery={() => undefined}
      />
    </Flex>
  );
}
