import { useMemo, useState } from "react";
import { ResizableBox, type ResizableBoxProps } from "react-resizable";
import { useWindowSize } from "react-use";

import type { CollectionPickerItem } from "metabase/common/components/Pickers/CollectionPicker";
import type { DataPickerItem } from "metabase/common/components/Pickers/DataPicker";
import { useSetting } from "metabase/common/hooks";
import NativeQueryEditor, {
  type SelectionRange,
} from "metabase/query_builder/components/NativeQueryEditor";
import type { QueryModalType } from "metabase/query_builder/constants";
import { Notebook } from "metabase/querying/notebook/components/Notebook";
import { Box } from "metabase/ui";
import type Question from "metabase-lib/v1/Question";
import type Database from "metabase-lib/v1/metadata/Database";
import type NativeQuery from "metabase-lib/v1/queries/NativeQuery";
import type {
  NativeQuerySnippet,
  RecentCollectionItem,
} from "metabase-types/api";

import { ResizeHandle } from "../ResizeHandle";

import S from "./QuerySection.module.css";

const EDITOR_HEIGHT = 550;
const NATIVE_HEADER_HEIGHT = 55;
const HEADER_HEIGHT = 65 + 50;

const NATIVE_EDITOR_SIDEBAR_FEATURES = {
  dataReference: true,
  snippets: true,
  formatQuery: true,
  variables: false,
  promptInput: false,
  aiGeneration: false,
};

type QuerySectionProps = {
  question: Question;
  proposedQuestion: Question | undefined;
  shouldDisableDatabase?: (database: Database) => boolean;
  shouldDisableItem?: (
    item: DataPickerItem | CollectionPickerItem | RecentCollectionItem,
  ) => boolean;
  modalSnippet?: NativeQuerySnippet | null;
  nativeEditorSelectedText?: string | null;
  isNative: boolean;
  isRunnable: boolean;
  isRunning: boolean;
  isResultDirty: boolean;
  isShowingDataReference: boolean;
  isShowingSnippetSidebar: boolean;
  onChange: (newQuestion: Question) => void;
  onRunQuery: () => Promise<void>;
  onToggleDataReference: () => void;
  onToggleSnippetSidebar: () => void;
  onCancelQuery: () => void;
  onInsertSnippet?: (snippet: NativeQuerySnippet) => void;
  onChangeModalSnippet: (snippet: NativeQuerySnippet | null) => void;
  onChangeNativeEditorSelection: (range: SelectionRange[]) => void;
  onOpenModal: (type: QueryModalType) => void;
  onAcceptProposed?: () => void;
  onRejectProposed?: () => void;
};

export function QuerySection({
  question,
  proposedQuestion,
  isNative,
  isRunnable,
  isRunning,
  isResultDirty,
  isShowingDataReference,
  isShowingSnippetSidebar,
  onChange,
  onRunQuery,
  onCancelQuery,
  onToggleDataReference,
  onToggleSnippetSidebar,
  shouldDisableItem,
  shouldDisableDatabase,
  modalSnippet,
  onInsertSnippet,
  onChangeModalSnippet,
  onChangeNativeEditorSelection,
  nativeEditorSelectedText,
  onOpenModal,
  onAcceptProposed,
  onRejectProposed,
}: QuerySectionProps) {
  const [isResizing, setIsResizing] = useState(false);
  const reportTimezone = useSetting("report-timezone-long");
  const editorHeight = useInitialEditorHeight(isNative);

  const dataPickerOptions = useMemo(
    () => ({ shouldDisableItem }),
    [shouldDisableItem],
  );

  const resizableBoxProps: Partial<ResizableBoxProps> = useMemo(
    () => ({
      className: S.nativeResizableBox,
      height: editorHeight,
      resizeHandles: ["s"],
      style: isResizing ? undefined : { transition: "height 0.25s" },
      onResizeStart: () => setIsResizing(true),
      onResizeStop: () => setIsResizing(false),
    }),
    [isResizing, editorHeight],
  );

  const handleResize = () => {
    return null;
  };

  const setQuestion = (newQuestion: Question) => {
    onChange(newQuestion);
    return Promise.resolve();
  };

  const handleNativeQueryChange = (newNativeQuery: NativeQuery) => {
    onChange(newNativeQuery.question());
  };

  return isNative ? (
    <NativeQueryEditor
      question={question}
      proposedQuestion={proposedQuestion}
      query={question.legacyNativeQuery()}
      resizableBoxProps={resizableBoxProps}
      placeholder="SELECT * FROM TABLE_NAME"
      isRunnable={isRunnable}
      isRunning={isRunning}
      isResultDirty={isResultDirty}
      isInitiallyOpen
      isShowingDataReference={isShowingDataReference}
      isShowingSnippetSidebar={isShowingSnippetSidebar}
      hasTopBar
      databaseIsDisabled={shouldDisableDatabase}
      hasRunButton
      isNativeEditorOpen
      readOnly={false}
      hasParametersList={false}
      handleResize={handleResize}
      runQuery={onRunQuery}
      cancelQuery={onCancelQuery}
      setDatasetQuery={handleNativeQueryChange}
      sidebarFeatures={NATIVE_EDITOR_SIDEBAR_FEATURES}
      toggleDataReference={onToggleDataReference}
      toggleSnippetSidebar={onToggleSnippetSidebar}
      modalSnippet={modalSnippet}
      insertSnippet={onInsertSnippet}
      closeSnippetModal={() => onChangeModalSnippet(null)}
      setNativeEditorSelectedRange={onChangeNativeEditorSelection}
      nativeEditorSelectedText={nativeEditorSelectedText}
      onOpenModal={onOpenModal}
      onAcceptProposed={onAcceptProposed}
      onRejectProposed={onRejectProposed}
    />
  ) : (
    <ResizableBox
      axis="y"
      className={S.queryResizableBox}
      height={editorHeight}
      handle={<ResizeHandle />}
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
          updateQuestion={setQuestion}
          runQuestionQuery={onRunQuery}
          dataPickerOptions={dataPickerOptions}
        />
      </Box>
    </ResizableBox>
  );
}

function getHeaderHeight(isNative: boolean) {
  if (isNative) {
    return HEADER_HEIGHT + NATIVE_HEADER_HEIGHT;
  }
  return HEADER_HEIGHT;
}

function useInitialEditorHeight(isNative: boolean) {
  const { height: windowHeight } = useWindowSize();
  const headerHeight = getHeaderHeight(isNative);
  return Math.min(0.6 * (windowHeight - headerHeight), EDITOR_HEIGHT);
}
