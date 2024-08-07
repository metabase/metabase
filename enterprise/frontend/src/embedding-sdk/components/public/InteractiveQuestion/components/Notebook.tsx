import { useInteractiveQuestionContext } from "embedding-sdk/components/public/InteractiveQuestion/context";
import { useDispatch, useSelector } from "metabase/lib/redux";
import {
  runQuestionQuery,
  updateQuestion,
} from "metabase/query_builder/actions";
import { default as QBNotebook } from "metabase/query_builder/components/notebook/Notebook";
import {
  getIsDirty,
  getIsResultDirty,
  getIsRunnable,
} from "metabase/query_builder/selectors";
import { getSetting } from "metabase/selectors/settings";
import { ScrollArea } from "metabase/ui";
import { getMetadata } from "metabase/selectors/metadata";
import Question from "metabase-lib/v1/Question";
import { DatasetQuery } from "metabase-types/api";
import { sourceTableOrCardId } from "metabase-lib";

type NotebookProps = {
  onApply?: () => void;
};

export const Notebook = ({ onApply = () => {} }: NotebookProps) => {
  const { question, onQuestionChange } = useInteractiveQuestionContext();

  const isDirty = useSelector(getIsDirty);
  const isRunnable = useSelector(getIsRunnable);
  const isResultDirty = useSelector(getIsResultDirty);
  const reportTimezone = useSelector(state =>
    getSetting(state, "report-timezone-long"),
  );
  const metadata = useSelector(getMetadata);

  const dispatch = useDispatch();

  const handleUpdateQuestion = async (question: Question) => {
    console.log("handleUpdateQuestion", question.datasetQuery());
    const query = question.query();
    const sourceTableId = sourceTableOrCardId(query);
    const table = metadata.table(sourceTableId);
    const databaseId = table?.db_id;

    console.log({
      sourceTableId,
      table,
      databaseId,
      query,
      next: question.setDatasetQuery({
        ...question.datasetQuery(),
        database: databaseId ?? null,
      }),
    });

    await onQuestionChange(
      question.setDatasetQuery({
        ...question.datasetQuery(),
        database: databaseId ?? null,
      }),
    );
  };

  return (
    question && (
      <ScrollArea w="100%" h="100%">
        <QBNotebook
          question={question}
          isDirty={isDirty}
          isRunnable={isRunnable}
          isResultDirty={Boolean(isResultDirty)}
          reportTimezone={reportTimezone}
          readOnly={false}
          updateQuestion={handleUpdateQuestion}
          runQuestionQuery={() => {
            dispatch(runQuestionQuery());
            onApply();
          }}
          setQueryBuilderMode={() => {}}
          hasVisualizeButton={true}
        />
      </ScrollArea>
    )
  );
};
