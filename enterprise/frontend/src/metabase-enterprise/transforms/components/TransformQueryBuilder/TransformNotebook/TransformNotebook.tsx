import { useSetting } from "metabase/common/hooks";
import { Notebook } from "metabase/querying/notebook/components/Notebook";
import type Question from "metabase-lib/v1/Question";

type TransformNotebookProps = {
  question: Question;
  onChange: (newQuestion: Question) => void;
};

export function TransformNotebook({
  question,
  onChange,
}: TransformNotebookProps) {
  const reportTimezone = useSetting("report-timezone-long");

  const handleChange = (newQuestion: Question) => {
    onChange(newQuestion);
    return Promise.resolve();
  };

  return (
    <Notebook
      question={question}
      isDirty={false}
      isRunnable={false}
      isResultDirty={false}
      reportTimezone={reportTimezone}
      hasVisualizeButton={false}
      updateQuestion={handleChange}
      runQuestionQuery={() => Promise.resolve()}
    />
  );
}
