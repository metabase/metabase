import { useState } from "react";
import { ResizableBox } from "react-resizable";

import { useSetting } from "metabase/common/hooks";
import { Notebook } from "metabase/querying/notebook/components/Notebook";
import { Flex } from "metabase/ui";
import type Question from "metabase-lib/v1/Question";

import { ResizableBoxHandle } from "./ResizableBoxHandle";
import S from "./TransformNotebook.module.css";

const NOTEBOOK_HEIGHT = 500;

type TransformNotebookProps = {
  question: Question;
  onChange: (newQuestion: Question) => void;
};

export function TransformNotebook({
  question,
  onChange,
}: TransformNotebookProps) {
  const [isResizing, setIsResizing] = useState(false);
  const reportTimezone = useSetting("report-timezone-long");

  const handleChange = (newQuestion: Question) => {
    onChange(newQuestion);
    return Promise.resolve();
  };

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
      <Flex w="100%" style={{ overflowY: isResizing ? "hidden" : "auto" }}>
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
      </Flex>
    </ResizableBox>
  );
}
