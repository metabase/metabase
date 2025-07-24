import { t } from "ttag";

import { useSetting } from "metabase/common/hooks";
import { useSelector } from "metabase/lib/redux";
import { Notebook } from "metabase/querying/notebook/components/Notebook";
import { getMetadata } from "metabase/selectors/metadata";
import { Box, Button, Group } from "metabase/ui";
import Question from "metabase-lib/v1/Question";
import type { DatasetQuery } from "metabase-types/api";

import S from "./TransformQueryBuilder.module.css";

type TransformQueryBuilderProps = {
  query: DatasetQuery;
  isSaving?: boolean;
  onChange: (query: DatasetQuery) => void;
  onSave: () => void;
  onCancel: () => void;
};

export function TransformQueryBuilder({
  query,
  isSaving,
  onChange,
  onSave,
  onCancel,
}: TransformQueryBuilderProps) {
  const metadata = useSelector(getMetadata);
  const question = Question.create({
    dataset_query: query,
    metadata,
  });
  const reportTimezone = useSetting("report-timezone-long");

  const handleUpdateQuestion = async (newQuestion: Question) => {
    onChange(newQuestion.datasetQuery());
  };

  return (
    <Box flex="1 1 0" bg="bg-white">
      <Group className={S.header} px="md" py="sm" justify="end">
        <Button
          variant="filled"
          loading={isSaving}
          onClick={onSave}
        >{t`Save`}</Button>
        <Button onClick={onCancel}>{t`Cancel`}</Button>
      </Group>
      <Notebook
        question={question}
        isDirty={false}
        isRunnable={false}
        isResultDirty={false}
        reportTimezone={reportTimezone}
        hasVisualizeButton={false}
        updateQuestion={handleUpdateQuestion}
        runQuestionQuery={() => Promise.resolve()}
      />
    </Box>
  );
}
