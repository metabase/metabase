import { useMemo, useState } from "react";
import { ResizableBox, type ResizableBoxProps } from "react-resizable";

import type { CollectionPickerItem } from "metabase/common/components/Pickers/CollectionPicker";
import type { DataPickerItem } from "metabase/common/components/Pickers/DataPicker";
import { useSetting } from "metabase/common/hooks";
import NativeQueryEditor from "metabase/query_builder/components/NativeQueryEditor";
import { Notebook } from "metabase/querying/notebook/components/Notebook";
import { Box } from "metabase/ui";
import { doesDatabaseSupportTransforms } from "metabase-enterprise/transforms/utils";
import type Question from "metabase-lib/v1/Question";
import type Database from "metabase-lib/v1/metadata/Database";
import type NativeQuery from "metabase-lib/v1/queries/NativeQuery";
import type { Database as ApiDatabase, RecentItem } from "metabase-types/api";

import S from "./EditorBody.module.css";
import { ResizableBoxHandle } from "./ResizableBoxHandle";

const EDITOR_HEIGHT = 400;

type EditorBodyProps = {
  question: Question;
  isNative: boolean;
  isRunnable: boolean;
  isRunning: boolean;
  isResultDirty: boolean;
  onChange: (newQuestion: Question) => void;
  onRunQuery: () => Promise<void>;
  onCancelQuery: () => void;
  databases: ApiDatabase[];
};

export function EditorBody({
  question,
  isNative,
  isRunnable,
  isRunning,
  isResultDirty,
  onChange,
  onRunQuery,
  onCancelQuery,
  databases,
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
      databaseIsDisabled={(db: Database) => {
        const database = databases.find((database) => database.id === db.id);
        return !doesDatabaseSupportTransforms(database);
      }}
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
