import { useCallback, useState } from "react";

import type { DatasetData, RowValue } from "metabase-types/api";

type UseTableEditingCellProps = {
  data: DatasetData;
};

export type TableEditingCell = {
  rowIndex: number;
  columnId: string;
  value: RowValue;
};

export function useTableEditingCell({ data }: UseTableEditingCellProps) {
  const [editingCell, setEditingCell] = useState<TableEditingCell | null>(null);

  const handleSelectEditingCell = useCallback(
    (rowIndex: number, columnId: string) => {
      if (!data) {
        return;
      }

      const { rows, cols } = data;
      const columnIndex = cols.findIndex((col) => col.name === columnId);
      const value = rows[rowIndex][columnIndex];

      setEditingCell({ rowIndex, columnId, value });
    },
    [data],
  );

  return {
    editingCell,
    handleSelectEditingCell,
  };
}
