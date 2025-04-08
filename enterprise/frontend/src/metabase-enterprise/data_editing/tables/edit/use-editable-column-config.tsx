import { useMemo } from "react";

import type { VisualizationSettings } from "metabase-types/api";

export type EditableTableColumnConfig = {
  name: string;
  enabled: boolean;
  editable: boolean;
}[];

export function useEditableTableColumnConfigFromVisualizationSettings(
  visualizationSettings?: VisualizationSettings,
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

    const enableAllEditableColumns = editableColumns.length === 0;
    const editableColumnsSet = new Set(editableColumns);

    return columnSettings.map((column) => ({
      name: column.name,
      enabled: column.enabled,
      editable: enableAllEditableColumns || editableColumnsSet.has(column.name),
    }));
  }, [visualizationSettings]);
}
