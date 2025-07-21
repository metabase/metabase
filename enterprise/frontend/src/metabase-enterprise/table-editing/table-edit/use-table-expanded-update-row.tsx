import { useCallback, useState } from "react";

import { isPK } from "metabase-lib/v1/types/utils/isa";
import type { Dataset, DatasetColumn, RowValues } from "metabase-types/api";

import {
  type RowCellsWithPkValue,
  TableActionId,
  type TableEditingActionScope,
} from "../api/types";

import { useActionFormDescription } from "./use-table-action-form-description";
import type { TableRowUpdateHandler } from "./use-table-crud";

type UseTableExpandedUpdateRowProps = {
  dataset?: Dataset;
  scope: TableEditingActionScope;
  handleRowUpdate: TableRowUpdateHandler;
};

export type ExpandedRow = {
  input: RowCellsWithPkValue;
  params: RowCellsWithPkValue;
};

export function useTableExpandedUpdateRow({
  dataset,
  scope,
  handleRowUpdate,
}: UseTableExpandedUpdateRowProps) {
  const [expandedRow, setExpandedRow] = useState<ExpandedRow | null>(null);

  const handleExpandRow = useCallback(
    (rowIndex: number) => {
      if (!dataset) {
        return;
      }

      const { rows, cols } = dataset.data;
      const { input, params } = getRowInputAndParamsFromRow(
        cols,
        rows[rowIndex],
      );

      setExpandedRow({ input, params });
    },
    [dataset],
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

  const { data: formDescription } = useActionFormDescription({
    actionId: TableActionId.UpdateRow,
    scope,
  });

  return {
    expandedRow,
    handleExpandRow,
    handleExpandedRowUpdate,
    closeExpandedRow,
    formDescription,
  };
}

function getRowInputAndParamsFromRow(cols: DatasetColumn[], row: RowValues) {
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
