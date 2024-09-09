import { useState } from "react";
import { ResizableBox } from "react-resizable";

import { Notebook } from "metabase/querying/notebook/components/Notebook";
import { Box, Flex } from "metabase/ui";
import type Question from "metabase-lib/v1/Question";

import S from "./MetricEditorBody.module.css";
import { MetricEditorSidebar } from "./MetricEditorSidebar";
import { ResizableBoxHandle } from "./ResizableBoxHandle";

const NOTEBOOK_HEIGHT = 500;

type MetricEditorBodyProps = {
  question: Question;
  reportTimezone: string;
  isDirty: boolean;
  isResultDirty: boolean;
  isRunnable: boolean;
  onChange: (question: Question) => Promise<void>;
  onRunQuery: () => Promise<void>;
};

export function MetricEditorBody({
  question,
  reportTimezone,
  isDirty,
  isResultDirty,
  isRunnable,
  onChange,
  onRunQuery,
}: MetricEditorBodyProps) {
  const [isResizing, setIsResizing] = useState(false);

  return (
    <ResizableBox
      className={S.root}
      axis="y"
      height={NOTEBOOK_HEIGHT}
      handle={<ResizableBoxHandle />}
      resizeHandles={["s"]}
      onResizeStart={() => setIsResizing(true)}
      onResizeStop={() => setIsResizing(false)}
    >
      <Flex w="100%" style={{ overflow: isResizing ? "hidden" : "scroll" }}>
        <Box w="100%">
          <Notebook
            question={question}
            reportTimezone={reportTimezone}
            isDirty={isDirty}
            isRunnable={isRunnable}
            isResultDirty={isResultDirty}
            updateQuestion={onChange}
            runQuestionQuery={onRunQuery}
            hasVisualizeButton={false}
          />
        </Box>
        <MetricEditorSidebar />
      </Flex>
    </ResizableBox>
  );
}
