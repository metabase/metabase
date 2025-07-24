import { useSetting } from "metabase/common/hooks";
import { useSelector } from "metabase/lib/redux";
import { Notebook } from "metabase/querying/notebook/components/Notebook";
import { getMetadata } from "metabase/selectors/metadata";
import Question from "metabase-lib/v1/Question";
import type { DatasetQuery } from "metabase-types/api";

type TransformQueryBuilderProps = {
  query: DatasetQuery;
  onChange: (query: DatasetQuery) => void;
};

export function TransformQueryBuilder({
  query,
  onChange,
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
  );
}
