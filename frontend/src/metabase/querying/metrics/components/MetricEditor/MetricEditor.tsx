import { Flex } from "metabase/ui";
import type Question from "metabase-lib/v1/Question";

import { MetricEditorBody } from "./MetricEditorBody";
import { MetricEditorHeader } from "./MetricEditorHeader";

type MetricEditorProps = {
  question: Question;
  reportTimezone: string;
  isDirty: boolean;
  isRunnable: boolean;
  isResultDirty: boolean;
  updateQuestion: (question: Question) => Promise<void>;
  runQuestionQuery: () => Promise<void>;
  setQueryBuilderMode: (mode: string) => void;
};

export function MetricEditor({
  question,
  reportTimezone,
  isDirty,
  isRunnable,
  isResultDirty,
  updateQuestion,
  runQuestionQuery,
  setQueryBuilderMode,
}: MetricEditorProps) {
  return (
    <Flex h="100%" direction="column">
      <MetricEditorHeader question={question} />
      <MetricEditorBody
        question={question}
        reportTimezone={reportTimezone}
        isDirty={isDirty}
        isRunnable={isRunnable}
        isResultDirty={isResultDirty}
        updateQuestion={updateQuestion}
        runQuestionQuery={runQuestionQuery}
        setQueryBuilderMode={setQueryBuilderMode}
      />
    </Flex>
  );
}
