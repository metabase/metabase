import { useMemo } from "react";

import type { DatasetColumn } from "metabase-types/api";

import type { EditableTableColumnConfig } from "../use-editable-column-config";

export function useEditingModalOrderedVisibleDatasetColumns(
  datasetColumns: DatasetColumn[],
  columnsConfig?: EditableTableColumnConfig,
) {
  return useMemo(() => {
    if (!columnsConfig?.columnOrder.length) {
      return datasetColumns;
    }

    return columnsConfig.columnOrder
      .map((name) => datasetColumns.find((it) => it.name === name))
      .filter(
        (it): it is DatasetColumn =>
          it !== undefined && !columnsConfig.isColumnHidden(it.name),
      );
  }, [columnsConfig, datasetColumns]);
}
