import { useState } from "react";
import { useAsync } from "react-use";
import { t } from "ttag";

import { useSetting } from "metabase/common/hooks";
import Questions from "metabase/entities/questions";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { checkNotNull } from "metabase/lib/types";
import NativeQueryEditor from "metabase/query_builder/components/NativeQueryEditor/NativeQueryEditor";
import { Notebook } from "metabase/querying/notebook/components/Notebook";
import { getMetadata } from "metabase/selectors/metadata";
import { Box, Button, Group } from "metabase/ui";
import Question from "metabase-lib/v1/Question";
import type NativeQuery from "metabase-lib/v1/queries/NativeQuery";
import type { DatasetQuery } from "metabase-types/api";

type TransformQueryBuilderProps = {
  query: DatasetQuery;
  onSave: (query: DatasetQuery) => void;
  onCancel: () => void;
};

export function TransformQueryBuilder({
  query: initialQuery,
  onSave,
  onCancel,
}: TransformQueryBuilderProps) {
  const [query, setQuery] = useState(initialQuery);
  const metadata = useSelector(getMetadata);
  const question = Question.create({ dataset_query: query, metadata });
  const reportTimezone = useSetting("report-timezone-long");
  const dispatch = useDispatch();
  const { loading: isLoadingMetadata } = useAsync(
    async () =>
      await dispatch(Questions.actions.fetchAdhocMetadata(initialQuery)),
    [initialQuery],
  );

  if (isLoadingMetadata) {
    return null;
  }

  const handleUpdateQuestion = async (newQuestion: Question) => {
    setQuery(newQuestion.datasetQuery());
  };

  const handleUpdateNativeQuery = async (newQuery: NativeQuery) => {
    setQuery(newQuery.datasetQuery());
  };

  return (
    <Box flex={1} h="100%" bg="white">
      <Group px="xl" pt="xl" justify="end">
        <Button onClick={() => onSave(query)}>{t`Save`}</Button>
        <Button onClick={onCancel}>{t`Cancel`}</Button>
      </Group>
      {query.type === "query" ? (
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
      ) : (
        <NativeQueryEditor
          question={question}
          query={checkNotNull(question.legacyNativeQuery())}
          viewHeight="full"
          setDatasetQuery={handleUpdateNativeQuery}
          enableRun={true}
          hasEditingSidebar={false}
          isNativeEditorOpen
          hasParametersList={false}
          resizable={false}
          readOnly={false}
          editorContext="action"
        />
      )}
    </Box>
  );
}
