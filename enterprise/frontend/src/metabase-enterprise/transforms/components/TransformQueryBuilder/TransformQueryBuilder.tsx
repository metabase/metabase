import { t } from "ttag";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { Button, Flex, Group } from "metabase/ui";
import type Question from "metabase-lib/v1/Question";
import type { DatasetQuery } from "metabase-types/api";

import { TransformNotebook } from "./TransformNotebook";
import S from "./TransformQueryBuilder.module.css";
import { TransformVisualization } from "./TransformVisualization";
import { useQueryMetadata } from "./use-query-metadata";
import { useQueryResults } from "./use-query-results";
import { useQueryState } from "./use-query-state";

type TransformQueryBuilderProps = {
  query: DatasetQuery;
  isSaving?: boolean;
  onSave: (newQuery: DatasetQuery) => void;
  onCancel: () => void;
};

export function TransformQueryBuilder({
  query: initialQuery,
  isSaving,
  onSave,
  onCancel,
}: TransformQueryBuilderProps) {
  const { question, setQuestion } = useQueryState(initialQuery);
  const { isInitiallyLoaded } = useQueryMetadata(question);
  const { result, rawSeries, isRunning, runQuery } = useQueryResults(question);

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
      <Group
        className={S.header}
        px="md"
        py="sm"
        justify="end"
        pos="sticky"
        top={0}
        bg="bg-white"
      >
        <Button variant="filled" loading={isSaving} onClick={handleSave}>
          {t`Save`}
        </Button>
        <Button onClick={onCancel}>{t`Cancel`}</Button>
      </Group>
      <TransformNotebook question={question} onChange={handleChange} />
      <TransformVisualization
        question={question}
        result={result}
        rawSeries={rawSeries}
        isRunnable={true}
        isRunning={isRunning}
        isResultDirty={true}
        onRunQuery={runQuery}
        onCancelQuery={() => undefined}
      />
    </Flex>
  );
}
