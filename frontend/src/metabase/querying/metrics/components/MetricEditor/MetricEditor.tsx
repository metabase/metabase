import { Flex } from "metabase/ui";
import type Question from "metabase-lib/v1/Question";
import type { Dataset, RawSeries } from "metabase-types/api";

import { MetricEditorBody } from "./MetricEditorBody";
import { MetricEditorFooter } from "./MetricEditorFooter";
import { MetricEditorHeader } from "./MetricEditorHeader";

type MetricEditorProps = {
  question: Question;
  result: Dataset;
  rawSeries: RawSeries;
  reportTimezone: string;
  isDirty: boolean;
  isRunning: boolean;
  isResultDirty: boolean;
  updateQuestion: (question: Question) => Promise<void>;
  runQuestionQuery: () => Promise<void>;
  cancelQuery: () => void;
  setQueryBuilderMode: (mode: string) => void;
};

export function MetricEditor({
  question,
  result,
  rawSeries,
  reportTimezone,
  isDirty,
  isRunning,
  isResultDirty,
  updateQuestion,
  runQuestionQuery,
  cancelQuery,
  setQueryBuilderMode,
}: MetricEditorProps) {
  return (
    <Flex h="100%" direction="column">
      <MetricEditorHeader question={question} />
      <MetricEditorBody
        question={question}
        reportTimezone={reportTimezone}
        isDirty={isDirty}
        isResultDirty={isResultDirty}
        updateQuestion={updateQuestion}
        runQuestionQuery={runQuestionQuery}
        setQueryBuilderMode={setQueryBuilderMode}
      />
      <MetricEditorFooter
        question={question}
        result={result}
        rawSeries={rawSeries}
        isRunning={isRunning}
        isResultDirty={isResultDirty}
        runQuestionQuery={runQuestionQuery}
        cancelQuery={cancelQuery}
      />
    </Flex>
  );
}
