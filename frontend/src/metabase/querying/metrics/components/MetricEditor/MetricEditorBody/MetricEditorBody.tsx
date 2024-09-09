import { ResizableBox } from "react-resizable";

import { Notebook } from "metabase/querying/notebook/components/Notebook";
import { Box, Flex } from "metabase/ui";
import type Question from "metabase-lib/v1/Question";

import S from "./MetricEditorBody.module.css";
import { MetricEditorSidebar } from "./MetricEditorSidebar";

const NOTEBOOK_HEIGHT = 500;

type MetricEditorBodyProps = {
  question: Question;
  reportTimezone: string;
  isDirty: boolean;
  isResultDirty: boolean;
  isRunnable: boolean;
  updateQuestion: (question: Question) => Promise<void>;
  runQuestionQuery: () => Promise<void>;
  setQueryBuilderMode: (mode: string) => void;
};

export function MetricEditorBody({
  question,
  reportTimezone,
  isDirty,
  isResultDirty,
  isRunnable,
  updateQuestion,
  runQuestionQuery,
  setQueryBuilderMode,
}: MetricEditorBodyProps) {
  return (
    <ResizableBox className={S.root} axis="y" height={NOTEBOOK_HEIGHT}>
      <Flex className={S.content} w="100%">
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
    </ResizableBox>
  );
}
