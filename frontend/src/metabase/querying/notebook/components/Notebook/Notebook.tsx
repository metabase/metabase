import { arrayMove } from "@dnd-kit/sortable";
import { useMemo, useState } from "react";
import { t } from "ttag";

import type { DataPickerValue } from "metabase/common/components/Pickers/DataPicker";
import { useDispatch } from "metabase/lib/redux";
import { setUIControls, updateQuestion } from "metabase/query_builder/actions";
import { ColumnPickerSidebar } from "metabase/query_builder/components/ColumnPickerSidebar/ColumnPickerSidebar";
import { Box, Button, Flex } from "metabase/ui";
import { updateSettings } from "metabase/visualizations/lib/settings";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import type { VisualizationSettings } from "metabase-types/api";

import type { NotebookDataPickerOptions } from "../../types";
import { NotebookStepList } from "../NotebookStepList";

import { VisualizeButton } from "./VisualizationButton";
import { NotebookProvider } from "./context";

export type NotebookProps = {
  question: Question;
  isDirty: boolean;
  isRunnable: boolean;
  isResultDirty: boolean;
  reportTimezone: string;
  hasVisualizeButton?: boolean;
  updateQuestion: (question: Question) => Promise<void>;
  runQuestionQuery?: () => Promise<void>;
  setQueryBuilderMode?: (mode: string) => void;
  readOnly?: boolean;
  modelsFilterList?: DataPickerValue["model"][];
  dataPickerOptions?: NotebookDataPickerOptions;
};

export const Notebook = ({
  reportTimezone,
  readOnly,
  question,
  isDirty,
  isRunnable,
  isResultDirty,
  hasVisualizeButton = true,
  modelsFilterList,
  dataPickerOptions,
  runQuestionQuery,
  setQueryBuilderMode,
  updateQuestion,
}: NotebookProps) => {
  const dispatch = useDispatch();

  const handleUpdateQuestion = (question: Question): Promise<void> => {
    dispatch(setUIControls({ isModifiedFromNotebook: true }));
    return updateQuestion(question);
  };

  return (
    <NotebookProvider modelsFilterList={modelsFilterList}>
      <Box pos="relative" p={{ base: "1rem", sm: "2rem" }}>
        <NotebookStepList
          updateQuestion={handleUpdateQuestion}
          question={question}
          reportTimezone={reportTimezone}
          readOnly={readOnly}
          dataPickerOptions={dataPickerOptions}
        />
        {hasVisualizeButton && runQuestionQuery && (
          <Flex gap="md">
            <CustomizeColumnsButton question={question} />
            <VisualizeButton
              question={question}
              isDirty={isDirty}
              isRunnable={isRunnable}
              isResultDirty={isResultDirty}
              updateQuestion={updateQuestion}
              runQuestionQuery={runQuestionQuery}
              setQueryBuilderMode={setQueryBuilderMode}
            />
          </Flex>
        )}
      </Box>
    </NotebookProvider>
  );
};

interface CustomizeColumnsButtonProps {
  question: Question;
}

function CustomizeColumnsButton({ question }: CustomizeColumnsButtonProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const query = question.query();
  const dispatch = useDispatch();

  const columns = Lib.returnedColumns(query, -1);

  const items = useMemo<Lib.ColumnMetadata[]>(() => {
    const settings = question.settings();
    const tableColumns = settings["table.columns"] ?? [];

    if (tableColumns.length === 0) {
      return columns;
    }

    return tableColumns.map((settings) => {
      const column = columns.find(
        (c) => Lib.displayInfo(query, -1, c).name === settings.name,
      );

      if (!column) {
        throw new Error(`column not found ${settings.name}`);
      }

      return column;
    });
  }, [columns, query, question]);

  const handleClick = () => {
    setIsSidebarOpen(true);
  };

  const handleReorderColumns = (oldIndex: number, newIndex: number) => {
    const settings = question.settings();
    let newSettings: VisualizationSettings = settings;
    const tableColumns = settings["table.columns"] ?? [];

    if (tableColumns.length === 0) {
      newSettings = {
        ...settings,
        "table.columns": columns.map((c) => {
          const displayInfo = Lib.displayInfo(query, -1, c);
          return { name: displayInfo.name, enabled: true };
        }),
      };
    }

    const newTableColumns = arrayMove(
      newSettings["table.columns"] ?? [],
      oldIndex,
      newIndex,
    );
    newSettings = {
      ...newSettings,
      "table.columns": newTableColumns,
    };

    const newQuestion = question.setSettings(
      newSettings as VisualizationSettings,
    );
    dispatch(updateQuestion(newQuestion));
  };

  const handleColumnDisplayNameChange = (
    column: Lib.ColumnMetadata,
    newDisplayName: string,
  ) => {
    const columnInfo = Lib.displayInfo(query, -1, column);
    const columnKey = columnInfo.name;
    const currentSettings = question.card().visualization_settings || {};

    const diff = {
      column_settings: {
        ...currentSettings.column_settings,
        [JSON.stringify(["name", columnKey])]: {
          column_title: newDisplayName,
        },
      },
    };

    const newSettings = updateSettings(currentSettings, diff);
    const updatedQuestion = question.updateSettings(newSettings);

    dispatch(updateQuestion(updatedQuestion));
  };

  return (
    <>
      <Button onClick={handleClick}>{t`Customize Columns`}</Button>
      {isSidebarOpen && (
        <ColumnPickerSidebar
          title={t`Reorder and rename columns`}
          isOpen={isSidebarOpen}
          query={question.query()}
          stageIndex={-1}
          onClose={() => setIsSidebarOpen(false)}
          columns={items}
          isDraggable
          onReorderColumns={handleReorderColumns}
          onColumnDisplayNameChange={handleColumnDisplayNameChange}
          visualizationSettings={question.settings()}
        />
      )}
    </>
  );
}
