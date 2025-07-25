import { t } from "ttag";

import { useSelector } from "metabase/lib/redux";
import { getMetadata } from "metabase/selectors/metadata";
import { Box, Button, Group } from "metabase/ui";
import Question from "metabase-lib/v1/Question";
import type { DatasetQuery } from "metabase-types/api";

import { TransformNotebook } from "./TransformNotebook";
import S from "./TransformQueryBuilder.module.css";

type TransformQueryBuilderProps = {
  query: DatasetQuery;
  isSaving?: boolean;
  onChange: (query: DatasetQuery) => void;
  onSave: () => void;
  onCancel: () => void;
};

export function TransformQueryBuilder({
  query: datasetQuery,
  isSaving,
  onChange,
  onSave,
  onCancel,
}: TransformQueryBuilderProps) {
  const metadata = useSelector(getMetadata);
  const question = Question.create({
    dataset_query: datasetQuery,
    metadata,
  });

  const handleUpdateQuestion = async (newQuestion: Question) => {
    onChange(newQuestion.datasetQuery());
  };

  return (
    <Box className={S.root} flex="1 1 0" bg="bg-white">
      <Group
        className={S.header}
        px="md"
        py="sm"
        justify="end"
        pos="sticky"
        top={0}
        bg="bg-white"
      >
        <Button
          variant="filled"
          loading={isSaving}
          onClick={onSave}
        >{t`Save`}</Button>
        <Button onClick={onCancel}>{t`Cancel`}</Button>
      </Group>
      <TransformNotebook question={question} onChange={handleUpdateQuestion} />
    </Box>
  );
}
