import { useMemo, useState } from "react";
import { ResizableBox, type ResizableBoxProps } from "react-resizable";

import { useSetting } from "metabase/common/hooks";
import NativeQueryEditor from "metabase/query_builder/components/NativeQueryEditor";
import { Notebook } from "metabase/querying/notebook/components/Notebook";
import { Box } from "metabase/ui";
import type Question from "metabase-lib/v1/Question";
import type NativeQuery from "metabase-lib/v1/queries/NativeQuery";
import type { TransformSource } from "metabase-types/api";

import { PythonEditor } from "../PythonEditor";

import S from "./EditorBody.module.css";
import { ResizableBoxHandle } from "./ResizableBoxHandle";

const EDITOR_HEIGHT = 400;

type EditorBodyProps = {
  question: Question;
  isNative: boolean;
  isPython?: boolean;
  pythonSource?: TransformSource & { type: "python" };
  isRunnable: boolean;
  isRunning: boolean;
  isResultDirty: boolean;
  onChange: (newQuestion: Question) => void;
  onPythonChange?: (script: string) => void;
  onRunQuery: () => Promise<void>;
  onCancelQuery: () => void;
};

export function EditorBody({
  question,
  isNative,
  isPython = false,
  pythonSource,
  isRunnable,
  isRunning,
  isResultDirty,
  onChange,
  onPythonChange,
  onRunQuery,
  onCancelQuery,
}: EditorBodyProps) {
  const [isResizing, setIsResizing] = useState(false);
  const reportTimezone = useSetting("report-timezone-long");

  const resizableBoxProps: Partial<ResizableBoxProps> = useMemo(
    () => ({
      height: EDITOR_HEIGHT,
      resizeHandles: ["s"],
      style: isResizing ? undefined : { transition: "height 0.25s" },
      onResizeStart: () => setIsResizing(true),
      onResizeStop: () => setIsResizing(false),
    }),
    [isResizing],
  );

  const handleResize = () => {
    return null;
  };

  const handleQuestionChange = (newQuestion: Question) => {
    onChange(newQuestion);
    return Promise.resolve();
  };

  const handleNativeQueryChange = (newNativeQuery: NativeQuery) => {
    onChange(newNativeQuery.question());
  };

  const handlePythonChange = (script: string) => {
    onPythonChange?.(script);
  };

  if (isPython) {
    return (
      <PythonEditor
        script={pythonSource?.script || ""}
        isRunnable={isRunnable}
        isRunning={isRunning}
        isResultDirty={isResultDirty}
        onChange={handlePythonChange}
        onRunScript={onRunQuery}
        onCancelScript={onCancelQuery}
      />
    );
  }

  return isNative ? (
    <NativeQueryEditor
      question={question}
      query={question.legacyNativeQuery()}
      resizableBoxProps={resizableBoxProps}
      placeholder="SELECT * FROM TABLE_NAME"
      isRunnable={isRunnable}
      isRunning={isRunning}
      isResultDirty={isResultDirty}
      isInitiallyOpen
      isNativeEditorOpen
      hasTopBar
      hasRunButton
      readOnly={false}
      hasEditingSidebar={false}
      hasParametersList={false}
      handleResize={handleResize}
      runQuery={onRunQuery}
      cancelQuery={onCancelQuery}
      setDatasetQuery={handleNativeQueryChange}
    />
  ) : (
    <ResizableBox
      className={S.root}
      axis="y"
      height={EDITOR_HEIGHT}
      handle={<ResizableBoxHandle />}
      resizeHandles={["s"]}
      onResizeStart={() => setIsResizing(true)}
      onResizeStop={() => setIsResizing(false)}
    >
      <Box w="100%" style={{ overflowY: isResizing ? "hidden" : "auto" }}>
        <Notebook
          question={question}
          isDirty={false}
          isRunnable={false}
          isResultDirty={false}
          reportTimezone={reportTimezone}
          hasVisualizeButton={false}
          updateQuestion={handleQuestionChange}
          runQuestionQuery={onRunQuery}
        />
      </Box>
    </ResizableBox>
  );
}
