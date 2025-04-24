import { useMemo } from "react";

import type {
  DashCardVisualizationSettings,
  VisualizationSettings,
} from "metabase-types/api";

export type EditableTableColumnConfig = {
  columnOrder: string[];
  columnVisibilityMap: Record<string, boolean>;
  isColumnReadonly: (columnName: string) => boolean;
  isColumnHidden: (columnName: string) => boolean;
};

export function useEditableTableColumnConfigFromVisualizationSettings(
  visualizationSettings?: VisualizationSettings & DashCardVisualizationSettings,
): EditableTableColumnConfig | undefined {
  return useMemo(() => {
    if (!visualizationSettings) {
      return undefined;
    }

    const columnSettings = visualizationSettings["table.columns"] ?? [];
    const editableColumns =
      visualizationSettings["table.editableColumns"] ?? [];

    if (columnSettings.length === 0) {
      return undefined;
    }

    const isAllColumnsEditable = editableColumns.length === 0;
    const editableColumnSet = new Set(editableColumns);

    const columnOrder: string[] = [];
    const columnVisibilityMap: Record<string, boolean> = {};
    const readonlyColumnSet = new Set<string>();
    const hiddenColumnSet = new Set<string>();

    for (let i = 0; i < columnSettings.length; i++) {
      const column = columnSettings[i];

      columnOrder.push(column.name);
      columnVisibilityMap[column.name] = column.enabled;

      if (!column.enabled) {
        hiddenColumnSet.add(column.name);
      }

      if (!isAllColumnsEditable && !editableColumnSet.has(column.name)) {
        readonlyColumnSet.add(column.name);
      }
    }

    return {
      columnOrder,
      columnVisibilityMap,
      isColumnHidden: (columnName: string) => hiddenColumnSet.has(columnName),
      isColumnReadonly: (columnName: string) =>
        readonlyColumnSet.has(columnName),
    };
  }, [visualizationSettings]);
}
