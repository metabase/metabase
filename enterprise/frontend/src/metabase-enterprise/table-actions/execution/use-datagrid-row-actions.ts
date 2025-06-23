import type { Row } from "@tanstack/react-table";
import { useCallback, useMemo, useState } from "react";

import type { DataGridRowAction } from "metabase/data-grid/types";
import { getRowPkValues } from "metabase-enterprise/data_editing/tables/edit/utils";
import type { RowCellsWithPkValue } from "metabase-enterprise/data_editing/tables/types";
import type {
  DatasetData,
  EditableTableActionsDisplaySettings,
  RowValues,
} from "metabase-types/api";

import { isBuiltInEditableTableAction } from "../settings/AddOrEditActionSettingsContent/utils";

type UseDataGridRowActionsProps = {
  actionSettings?: EditableTableActionsDisplaySettings[];
  datasetData: DatasetData | null | undefined;
};

export type SelectedRowAction = {
  action: DataGridRowAction;
  input: RowCellsWithPkValue;
};

export function useDataGridRowActions({
  actionSettings,
  datasetData,
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
      const input = getRowPkValues(datasetData.cols, rowData);

      setSelectedRowAction({
        action,
        input,
      });
    },
    [datasetData],
  );

  const handleRowActionFormClose = useCallback(() => {
    setSelectedRowAction(null);
  }, []);

  const rowActions = useMemo<DataGridRowAction[] | undefined>(() => {
    return actionSettings?.filter(
      (actionSettings) => !isBuiltInEditableTableAction(actionSettings),
    );
  }, [actionSettings]);

  return {
    rowActions,
    selectedRowAction,
    onRowActionButtonClick: handleRowActionButtonClick,
    onRowActionFormClose: handleRowActionFormClose,
  };
}
