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
import type { NotebookDataPickerOptions } from "metabase/querying/notebook/types";
import { Box } from "metabase/ui";
import { doesDatabaseSupportTransforms } from "metabase-enterprise/transforms/utils";
import type Question from "metabase-lib/v1/Question";
import type NativeQuery from "metabase-lib/v1/queries/NativeQuery";
import type {
  Database,
  NativeQuerySnippet,
  RecentItem,
} from "metabase-types/api";

import { EditorResizeHandle } from "../EditorResizeHandle";

import S from "./EditorBody.module.css";

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

type EditorBodyProps = {
  question: Question;
  databases: Database[];
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
};

export function EditorBody({
  question,
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
  databases,
  modalSnippet,
  onInsertSnippet,
  onChangeModalSnippet,
  onChangeNativeEditorSelection,
  nativeEditorSelectedText,
  onOpenModal,
}: EditorBodyProps) {
  const [isResizing, setIsResizing] = useState(false);
  const reportTimezone = useSetting("report-timezone-long");
  const editorHeight = useInitialEditorHeight(isNative);

  const dataPickerOptions = useMemo(
    () => getDataPickerOptions(databases),
    [databases],
  );

  const resizableBoxProps: Partial<ResizableBoxProps> = useMemo(
    () => ({
      height: editorHeight,
      resizeHandles: ["s"],
      className: S.root,
      style: isResizing ? undefined : { transition: "height 0.25s" },
      onResizeStart: () => setIsResizing(true),
      onResizeStop: () => setIsResizing(false),
    }),
    [isResizing, editorHeight],
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
      isShowingDataReference={isShowingDataReference}
      isShowingSnippetSidebar={isShowingSnippetSidebar}
      hasTopBar
      hasRunButton
      isNativeEditorOpen
      readOnly={false}
      hasParametersList={false}
      hasEditingSidebar={false}
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
      databaseIsDisabled={(db: Database) => {
        const database = databases.find((database) => database.id === db.id);
        return !doesDatabaseSupportTransforms(database);
      }}
      setNativeEditorSelectedRange={onChangeNativeEditorSelection}
      nativeEditorSelectedText={nativeEditorSelectedText}
      onOpenModal={onOpenModal}
    />
  ) : (
    <ResizableBox
      axis="y"
      className={S.root}
      height={editorHeight}
      handle={<EditorResizeHandle />}
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
          dataPickerOptions={dataPickerOptions}
        />
      </Box>
    </ResizableBox>
  );
}

function shouldDisableItem(
  item: DataPickerItem | CollectionPickerItem | RecentItem,
  databases: Database[],
) {
  // Disable unsupported databases
  if (item.model === "database") {
    const database = databases.find((db) => db.id === item.id);
    return !doesDatabaseSupportTransforms(database);
  }

  if (
    // Disable questions based on unsupported databases
    item.model === "card" ||
    item.model === "dataset" ||
    item.model === "metric" ||
    // Disable tables based on unsupported databases
    item.model === "table"
  ) {
    if ("database_id" in item) {
      const database = databases.find((db) => db.id === item.database_id);
      return !doesDatabaseSupportTransforms(database);
    }
    if ("database" in item) {
      const database = databases.find((db) => db.id === item.database.id);
      return !doesDatabaseSupportTransforms(database);
    }
  }

  // Disable dashboards altogether
  return item.model === "dashboard";
}

function getDataPickerOptions(
  databases: Database[],
): NotebookDataPickerOptions {
  return {
    shouldDisableItem: (item) => shouldDisableItem(item, databases),
  };
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
