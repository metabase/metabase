import { useMemo, useState } from "react";
import { ResizableBox, type ResizableBoxProps } from "react-resizable";

import type { CollectionPickerItem } from "metabase/common/components/Pickers/CollectionPicker";
import type { DataPickerItem } from "metabase/common/components/Pickers/DataPicker";
import { useSetting } from "metabase/common/hooks";
import NativeQueryEditor, {
  type SelectionRange,
} from "metabase/query_builder/components/NativeQueryEditor";
import { Notebook } from "metabase/querying/notebook/components/Notebook";
import { Box } from "metabase/ui";
import { doesDatabaseSupportTransforms } from "metabase-enterprise/transforms/utils";
import type Question from "metabase-lib/v1/Question";
import type Database from "metabase-lib/v1/metadata/Database";
import type NativeQuery from "metabase-lib/v1/queries/NativeQuery";
import type {
  Database as ApiDatabase,
  NativeQuerySnippet,
  RecentItem,
} from "metabase-types/api";

import { ResizeHandle } from "../ResizeHandle";

import S from "./EditorBody.module.css";

const EDITOR_HEIGHT = 550;

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

  modalSnippet?: NativeQuerySnippet | null;
  onChangeModalSnippet: (snippet: NativeQuerySnippet | null) => void;
  onChangeNativeEditorSelection: (range: SelectionRange[]) => void;
  nativeEditorSelectedText?: string | null;

  databases: ApiDatabase[];
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
  onChangeModalSnippet,
  onChangeNativeEditorSelection,
  nativeEditorSelectedText,
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

  const dataPickerOptions = useDataPickerOptions({ databases });

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
      isNativeEditorOpen
      hasTopBar
      hasRunButton
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
      closeSnippetModal={() => onChangeModalSnippet(null)}
      databaseIsDisabled={(db: Database) => {
        const database = databases.find((database) => database.id === db.id);
        return !doesDatabaseSupportTransforms(database);
      }}
      setNativeEditorSelectedRange={onChangeNativeEditorSelection}
      nativeEditorSelectedText={nativeEditorSelectedText}
    />
  ) : (
    <ResizableBox
      className={S.root}
      axis="y"
      height={EDITOR_HEIGHT}
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
          updateQuestion={handleQuestionChange}
          runQuestionQuery={onRunQuery}
          dataPickerOptions={dataPickerOptions}
        />
      </Box>
    </ResizableBox>
  );
}

function useDataPickerOptions({ databases }: { databases: ApiDatabase[] }) {
  return useMemo(() => {
    return {
      shouldDisableItem: (
        item: DataPickerItem | CollectionPickerItem | RecentItem,
      ) => {
        // Disable unsuppported databases
        if (item.model === "database") {
          const database = databases.find((db) => db.id === item.id);
          return !doesDatabaseSupportTransforms(database);
        }

        if (
          // Disable questions based on unsuppported databases
          item.model === "card" ||
          item.model === "dataset" ||
          item.model === "metric" ||
          // Disable tables based on unsuppported databases
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
        if (item.model === "dashboard") {
          return true;
        }

        return false;
      },
    };
  }, [databases]);
}
