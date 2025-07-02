import type { Row } from "@tanstack/react-table";
import { useCallback, useMemo, useState } from "react";

import type { DataGridRowAction } from "metabase/data-grid/types";
import type { RowCellsWithPkValue } from "metabase-enterprise/data_editing/tables/types";
import type {
  DatasetColumn,
  DatasetData,
  EditableTableActionsDisplaySettings,
  RowValue,
  RowValues,
  TableRowActionDisplaySettings,
} from "metabase-types/api";

import { isBuiltInEditableTableAction } from "../settings/AddOrEditActionSettingsContent/utils";

type UseDataGridRowActionsProps = {
  actionSettings?: EditableTableActionsDisplaySettings[];
  datasetData: DatasetData | null | undefined;
  getActionInputFromRow?: (
    cols: DatasetColumn[],
    rowData: RowValues,
  ) => RowCellsWithPkValue;
};

export type SelectedRowAction = {
  action: DataGridRowAction;
  input: RowCellsWithPkValue;
};

export function useDataGridRowActions({
  actionSettings,
  datasetData,
  getActionInputFromRow = rowValuesToRecord,
}: UseDataGridRowActionsProps) {
  const [selectedRowAction, setSelectedRowAction] =
    useState<SelectedRowAction | null>(null);

  const handleRowActionButtonClick = useCallback(
    (action: DataGridRowAction, row: Row<RowValues>) => {
      if (!datasetData) {
        console.warn("Failed to trigger action, datasetData is null");
        return;
      }

      const rowIndex = row.index;
      const rowData = datasetData.rows[rowIndex];
      const input = getActionInputFromRow(datasetData.cols, rowData);

      setSelectedRowAction({
        action,
        input,
      });
    },
    [datasetData, getActionInputFromRow],
  );

  const handleRowActionFormClose = useCallback(() => {
    setSelectedRowAction(null);
  }, []);

  const rowActions = useMemo<DataGridRowAction[] | undefined>(() => {
    return actionSettings?.filter(
      (actionSettings): actionSettings is TableRowActionDisplaySettings =>
        !isBuiltInEditableTableAction(actionSettings),
    );
  }, [actionSettings]);

  return {
    rowActions,
    selectedRowAction,
    onRowActionButtonClick: handleRowActionButtonClick,
    onRowActionFormClose: handleRowActionFormClose,
  };
}

function rowValuesToRecord(cols: DatasetColumn[], rowData: RowValues) {
  return cols.reduce(
    (acc, col, index) => {
      return {
        ...acc,
        [col.name]: rowData[index],
      };
    },
    {} as Record<string, RowValue>,
  );
}
