import { useMemo, useState } from "react";
import { ResizableBox, type ResizableBoxProps } from "react-resizable";

import type { CollectionPickerItem } from "metabase/common/components/Pickers/CollectionPicker";
import type { DataPickerItem } from "metabase/common/components/Pickers/DataPicker";
import { useSetting } from "metabase/common/hooks";
import NativeQueryEditor from "metabase/query_builder/components/NativeQueryEditor";
import { Notebook } from "metabase/querying/notebook/components/Notebook";
import { Box } from "metabase/ui";
import type Question from "metabase-lib/v1/Question";
import type Database from "metabase-lib/v1/metadata/Database";
import type NativeQuery from "metabase-lib/v1/queries/NativeQuery";
import type { RecentItem } from "metabase-types/api";

import { useDoesDatabaseSupportTransforms } from "../../../hooks/use-does-database-support-transforms";

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

  const databaseSupportsTransforms = useDoesDatabaseSupportTransforms();

  const dataPickerOptions = useMemo(() => {
    return {
      shouldDisableItem: (
        item: DataPickerItem | CollectionPickerItem | RecentItem,
      ) => {
        // Disable unsuppported databases
        if (item.model === "database") {
          return !databaseSupportsTransforms(item.id);
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
            return !databaseSupportsTransforms(item.database_id);
          }
          if ("database" in item) {
            return !databaseSupportsTransforms(item.database.id);
          }
        }

        // Disable dashboards altogether
        if (item.model === "dashboard") {
          return true;
        }

        return false;
      },
    };
  }, [databaseSupportsTransforms]);

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
      databaseIsDisabled={(database: Database) =>
        !databaseSupportsTransforms(database.id)
      }
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
