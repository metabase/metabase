import { arrayMove } from "@dnd-kit/sortable";
import { useMemo } from "react";

import { useDispatch } from "metabase/lib/redux";
import { updateQuestion } from "metabase/query_builder/actions";
import { ColumnPickerSidebar } from "metabase/query_builder/components/ColumnPickerSidebar/ColumnPickerSidebar";
import { updateSettings } from "metabase/visualizations/lib/settings";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import type { VisualizationSettings } from "metabase-types/api";

interface CustomColumnsColumnPickerSidebarProps {
  question: Question;
  title?: string;
  isDraggable?: boolean;
  onClose: () => void;
}

function CustomColumnsColumnPickerSidebar({
  question,
  title,
  isDraggable,
  onClose,
}: CustomColumnsColumnPickerSidebarProps) {
  const dispatch = useDispatch();
  const currentQuery = question.query();
  const columns = Lib.returnedColumns(currentQuery, -1);

  // Custom columns items calculation
  const customColumnItems = useMemo<Lib.ColumnMetadata[]>(() => {
    const settings = question.settings();
    const tableColumns = settings["table.columns"] ?? [];

    if (tableColumns.length === 0) {
      return columns;
    }

    return tableColumns
      .map((settings) => {
        const column = columns.find(
          (c) => Lib.displayInfo(currentQuery, -1, c).name === settings.name,
        );
        return column;
      })
      .filter((column): column is Lib.ColumnMetadata => column !== undefined);
  }, [question, currentQuery, columns]);

  const handleReorderColumns = (oldIndex: number, newIndex: number) => {
    const settings = question.settings();
    let newSettings: VisualizationSettings = settings;
    const tableColumns = settings["table.columns"] ?? [];

    if (tableColumns.length === 0) {
      newSettings = {
        ...settings,
        "table.columns": columns.map((c) => {
          const displayInfo = Lib.displayInfo(currentQuery, -1, c);
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
    const columnInfo = Lib.displayInfo(currentQuery, -1, column);
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
    <ColumnPickerSidebar
      title={title}
      query={currentQuery}
      stageIndex={-1}
      onClose={onClose}
      columns={customColumnItems}
      isDraggable={isDraggable}
      onReorderColumns={handleReorderColumns}
      onColumnDisplayNameChange={handleColumnDisplayNameChange}
      visualizationSettings={question.settings()}
    />
  );
}

export { CustomColumnsColumnPickerSidebar };
