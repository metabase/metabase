import type { RowSelectionState } from "@tanstack/react-table";
import { useMemo, useState } from "react";

export function useEditingTableRowSelection() {
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const selectedRowIndices = useMemo(
    () => Object.keys(rowSelection).map(Number),
    [rowSelection],
  );

  return {
    rowSelection,
    selectedRowIndices,
    setRowSelection,
  };
}
