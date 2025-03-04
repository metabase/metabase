import { useCallback, useState } from "react";

import type { DataGridCellId } from "metabase/data-grid";

export const useTableEditing = () => {
  const [editingCellsMap, setEditingCellsMap] = useState<
    Record<DataGridCellId, boolean>
  >({});

  const onCellClickToEdit = useCallback((cellId: DataGridCellId) => {
    setEditingCellsMap(prevState => ({
      ...prevState,
      [cellId]: true,
    }));
  }, []);

  const onCellEditCancel = useCallback((cellId: DataGridCellId) => {
    setEditingCellsMap(prevState => ({
      ...prevState,
      [cellId]: false,
    }));
  }, []);

  return {
    onCellClickToEdit,
    onCellEditCancel,
    editingCellsMap,
  };
};
