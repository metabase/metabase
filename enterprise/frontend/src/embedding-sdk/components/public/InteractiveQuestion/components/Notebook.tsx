import { LoadingOverlay } from "@mantine/core";

import { useInteractiveQuestionContext } from "embedding-sdk/components/public/InteractiveQuestion/context";
import { ENTITY_PICKER_Z_INDEX } from "metabase/common/components/EntityPicker";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { runQuestionQuery } from "metabase/query_builder/actions";
import { default as QBNotebook } from "metabase/query_builder/components/notebook/Notebook";
import {
  getIsDirty,
  getIsResultDirty,
  getIsRunnable,
  getUiControls,
} from "metabase/query_builder/selectors";
import { getMetadata } from "metabase/selectors/metadata";
import { getSetting } from "metabase/selectors/settings";
import { ScrollArea } from "metabase/ui";
import { sourceTableOrCardId } from "metabase-lib";
import type Question from "metabase-lib/v1/Question";

type NotebookProps = {
  onApply?: () => void;
};

export const Notebook = ({ onApply = () => {} }: NotebookProps) => {
  const { question, onQuestionChange, isQueryRunning } =
    useInteractiveQuestionContext();

  const isDirty = useSelector(getIsDirty);
  const isRunnable = useSelector(getIsRunnable);
  const isResultDirty = useSelector(getIsResultDirty);
  const reportTimezone = useSelector(state =>
    getSetting(state, "report-timezone-long"),
  );
  const metadata = useSelector(getMetadata);

  const { isModifiedFromNotebook } = useSelector(getUiControls);

  const dispatch = useDispatch();

  const handleUpdateQuestion = async (question: Question) => {
    const query = question.query();
    const sourceTableId = sourceTableOrCardId(query);
    const table = metadata.table(sourceTableId);
    const databaseId = table?.db_id;

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
        <LoadingOverlay
          zIndex={ENTITY_PICKER_Z_INDEX - 1}
          visible={!isModifiedFromNotebook || isQueryRunning}
          overlayBlur={2}
        />
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
