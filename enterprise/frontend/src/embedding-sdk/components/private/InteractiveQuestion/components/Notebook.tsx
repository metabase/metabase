import { useMemo } from "react";

import { useInteractiveQuestionContext } from "embedding-sdk/components/private/InteractiveQuestion/context";
import { useSelector } from "metabase/lib/redux";
import { default as QBNotebook } from "metabase/query_builder/components/notebook/Notebook";
import {
  isQuestionDirty,
  isQuestionRunnable,
} from "metabase/query_builder/utils/question";
import { getMetadata } from "metabase/selectors/metadata";
import { getSetting } from "metabase/selectors/settings";
import { ScrollArea } from "metabase/ui";
import { sourceTableOrCardId } from "metabase-lib";
import type Question from "metabase-lib/v1/Question";

type NotebookProps = { onApply?: () => void };

export const Notebook = ({ onApply = () => {} }: NotebookProps) => {
  const { question, originalQuestion, updateQuestion, runQuestion } =
    useInteractiveQuestionContext();
  const metadata = useSelector(getMetadata);

  const isDirty = useMemo(
    () => isQuestionDirty(question, originalQuestion),
    [question, originalQuestion],
  );

  const isRunnable = useMemo(
    () => isQuestionRunnable(question, isDirty),
    [question, isDirty],
  );

  const reportTimezone = useSelector(state =>
    getSetting(state, "report-timezone-long"),
  );

  const handleUpdateQuestion = async (nextQuestion: Question) => {
    const query = nextQuestion.query();
    const sourceTableId = sourceTableOrCardId(query);
    const table = metadata.table(sourceTableId);
    const databaseId = table?.db_id;

    const nextQuestionWithDatabaseId = nextQuestion.setDatasetQuery({
      ...nextQuestion.datasetQuery(),
      database: databaseId ?? null,
    });

    await updateQuestion(nextQuestionWithDatabaseId, { run: false });
  };

  return (
    question && (
      <ScrollArea w="100%" h="100%">
        <QBNotebook
          question={question}
          isDirty={isDirty}
          isRunnable={isRunnable}
          isResultDirty={isDirty}
          reportTimezone={reportTimezone}
          readOnly={false}
          updateQuestion={handleUpdateQuestion}
          runQuestionQuery={async () => {
            await runQuestion();
            onApply();
          }}
          setQueryBuilderMode={() => {}}
          hasVisualizeButton={true}
        />
      </ScrollArea>
    )
  );
};
