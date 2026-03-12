import { useCallback, useState } from "react";

import { isPK } from "metabase-lib/v1/types/utils/isa";
import type { DatasetColumn, DatasetData, RowValues } from "metabase-types/api";

import {
  type RowCellsWithPkValue,
  TableActionId,
  type TableEditingActionScope,
} from "../api/types";

import { useActionFormDescription } from "./use-table-action-form-description";
import type {
  TableRowDeleteHandler,
  TableRowUpdateHandler,
} from "./use-table-crud";

type UseTableExpandedUpdateRowProps = {
  datasetData?: DatasetData;
  scope: TableEditingActionScope;
  handleRowUpdate: TableRowUpdateHandler;
  handleRowDelete: TableRowDeleteHandler;
};

export type ExpandedRow = {
  input: RowCellsWithPkValue;
  params: RowCellsWithPkValue;
};

export function useTableExpandedUpdateRow({
  datasetData,
  scope,
  handleRowUpdate,
  handleRowDelete,
}: UseTableExpandedUpdateRowProps) {
  const [expandedRow, setExpandedRow] = useState<ExpandedRow | null>(null);

  const handleExpandRow = useCallback(
    (rowIndex: number) => {
      if (!datasetData) {
        return;
      }

      const { rows, cols } = datasetData;
      const { input, params } = getRowInputAndParamsFromRow(
        cols,
        rows[rowIndex],
      );

      setExpandedRow({ input, params });
    },
    [datasetData],
  );

  const closeExpandedRow = useCallback(() => {
    setExpandedRow(null);
  }, []);

  const handleExpandedRowUpdate = useCallback(
    (params: RowCellsWithPkValue) => {
      if (!expandedRow) {
        // Type safety
        return Promise.resolve(false);
      }

      return handleRowUpdate({
        input: expandedRow.input,
        params,
      });
    },
    [expandedRow, handleRowUpdate],
  );

  const handleExpandedRowDelete = useCallback(() => {
    if (!expandedRow) {
      return Promise.resolve(false);
    }

    return handleRowDelete(expandedRow.input);
  }, [expandedRow, handleRowDelete]);

  const { data: formDescription } = useActionFormDescription({
    actionId: TableActionId.UpdateRow,
    scope,
  });

  return {
    expandedRow,
    handleExpandRow,
    handleExpandedRowUpdate,
    handleExpandedRowDelete,
    closeExpandedRow,
    formDescription,
  };
}

export function getRowInputAndParamsFromRow(
  cols: DatasetColumn[],
  row: RowValues,
) {
  const input: RowCellsWithPkValue = {};
  const params: RowCellsWithPkValue = {};

  cols.forEach((col, index) => {
    if (isPK(col)) {
      input[col.name] = row[index];
    }

    params[col.name] = row[index];
  });

  return { input, params };
}
