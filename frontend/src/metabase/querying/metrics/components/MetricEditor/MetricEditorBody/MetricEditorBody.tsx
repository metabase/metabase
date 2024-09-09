import { Notebook } from "metabase/querying/notebook/components/Notebook";
import { Box, Flex } from "metabase/ui";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";

import { MetricEditorSidebar } from "./MetricEditorSidebar";

type MetricEditorBodyProps = {
  question: Question;
  reportTimezone: string;
  isDirty: boolean;
  isResultDirty: boolean;
  updateQuestion: (question: Question) => Promise<void>;
  runQuestionQuery: () => Promise<void>;
  setQueryBuilderMode: (mode: string) => void;
};

export function MetricEditorBody({
  question,
  reportTimezone,
  isDirty,
  isResultDirty,
  updateQuestion,
  runQuestionQuery,
  setQueryBuilderMode,
}: MetricEditorBodyProps) {
  const isRunnable = Lib.canRun(question.query(), "metric");

  return (
    <Flex style={{ flex: 1 }}>
      <Box w="100%">
        <Notebook
          question={question}
          reportTimezone={reportTimezone}
          isDirty={isDirty}
          isRunnable={isRunnable}
          isResultDirty={isResultDirty}
          updateQuestion={updateQuestion}
          runQuestionQuery={runQuestionQuery}
          setQueryBuilderMode={setQueryBuilderMode}
          hasVisualizeButton={false}
        />
      </Box>
      <MetricEditorSidebar />
    </Flex>
  );
}
