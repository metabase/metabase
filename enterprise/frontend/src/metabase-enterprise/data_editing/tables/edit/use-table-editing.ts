import { useCallback, useState } from "react";

import type { DataGridCellId } from "metabase/data-grid";

export const useTableEditing = () => {
  const [editingCellId, setEditingCellId] = useState<DataGridCellId | null>(
    null,
  );

  const onCellClickToEdit = useCallback((cellId: DataGridCellId) => {
    setEditingCellId(cellId);
  }, []);

  const onCellEditCancel = useCallback(() => {
    setEditingCellId(null);
  }, []);

  return {
    onCellClickToEdit,
    onCellEditCancel,
    editingCellId,
  };
};
