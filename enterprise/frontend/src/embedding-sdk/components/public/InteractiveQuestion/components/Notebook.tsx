import { useInteractiveQuestionContext } from "embedding-sdk/components/public/InteractiveQuestion/context";
import { useSelector } from "metabase/lib/redux";
import { default as QBNotebook } from "metabase/query_builder/components/notebook/Notebook";
import {
  getIsDirty,
  getIsResultDirty,
  getIsRunnable,
} from "metabase/query_builder/selectors";
import { getSetting } from "metabase/selectors/settings";
import { ScrollArea } from "metabase/ui";

type NotebookProps = { onApply?: () => void };

export const Notebook = ({ onApply = () => {} }: NotebookProps) => {
  const { question, updateQuestion, runQuestion } =
    useInteractiveQuestionContext();

  const isDirty = useSelector(getIsDirty);
  const isRunnable = useSelector(getIsRunnable);
  const isResultDirty = useSelector(getIsResultDirty);
  const reportTimezone = useSelector(state =>
    getSetting(state, "report-timezone-long"),
  );

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
          updateQuestion={updateQuestion}
          runQuestionQuery={async () => {
            onApply();
            await runQuestion();
          }}
          setQueryBuilderMode={() => {}}
          hasVisualizeButton={true}
        />
      </ScrollArea>
    )
  );
};
