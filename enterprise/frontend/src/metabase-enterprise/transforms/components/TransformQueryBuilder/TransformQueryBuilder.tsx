import { useState } from "react";
import { t } from "ttag";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useSelector } from "metabase/lib/redux";
import { getMetadata } from "metabase/selectors/metadata";
import { Box, Button, Group } from "metabase/ui";
import Question from "metabase-lib/v1/Question";
import type { DatasetQuery } from "metabase-types/api";

import { TransformNotebook } from "./TransformNotebook";
import S from "./TransformQueryBuilder.module.css";
import { useQueryMetadata } from "./use-query-metadata";

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
  const [datasetQuery, setDatasetQuery] = useState(initialQuery);
  const metadata = useSelector(getMetadata);
  const question = Question.create({
    dataset_query: initialQuery,
    metadata,
  });

  const { isInitiallyLoaded } = useQueryMetadata(question);

  const handleChange = async (newQuestion: Question) => {
    setDatasetQuery(newQuestion.datasetQuery());
  };

  const handleSave = () => {
    onSave(datasetQuery);
  };

  if (!isInitiallyLoaded) {
    return <LoadingAndErrorWrapper loading />;
  }

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
        <Button variant="filled" loading={isSaving} onClick={handleSave}>
          {t`Save`}
        </Button>
        <Button onClick={onCancel}>{t`Cancel`}</Button>
      </Group>
      <TransformNotebook question={question} onChange={handleChange} />
    </Box>
  );
}
