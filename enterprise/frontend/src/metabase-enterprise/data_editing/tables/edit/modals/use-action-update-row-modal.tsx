import { useCallback, useMemo, useState } from "react";

import type { ActionScope, DatasetData, RowValue } from "metabase-types/api";

import { BuiltInTableAction } from "../../types";
import { useActionFormDescription } from "../use-table-action-form-description";

export type UseActionUpdateRowModalFromDatasetParams = {
  datasetData?: DatasetData;
  scope: ActionScope;
  fetchOnMount?: boolean;
};

export function useActionUpdateRowModalFromDataset({
  datasetData,
  scope,
  fetchOnMount = true,
}: UseActionUpdateRowModalFromDatasetParams) {
  const [rowIndex, setRowIndex] = useState<number | null>(null);

  const { data: actionFormDescription, refetch: refetchActionFormDescription } =
    useActionFormDescription({
      actionId: BuiltInTableAction.Update,
      scope,
      fetchOnMount,
    });

  const openUpdateRowModal = useCallback((rowIndex: number) => {
    setRowIndex(rowIndex);
  }, []);

  const closeUpdateRowModal = useCallback(() => {
    setRowIndex(null);
  }, []);

  const rowData = useMemo(() => {
    if (rowIndex === null || !datasetData) {
      return null;
    }

    const { cols, rows } = datasetData;
    const row = rows[rowIndex];

    // Remap the row to a record of field names to values
    return cols.reduce(
      (acc, col, index) => {
        acc[col.name] = row[index];
        return acc;
      },
      {} as Record<string, RowValue>,
    );
  }, [rowIndex, datasetData]);

  return {
    opened: rowIndex !== null,
    actionFormDescription,
    refetchActionFormDescription,
    rowIndex,
    rowData,
    openUpdateRowModal,
    closeUpdateRowModal,
  };
}
