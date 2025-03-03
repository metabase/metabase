import { useCallback, useState } from "react";

export const useTableEditing = () => {
  const [editingCellsMap, setEditingCellsMap] = useState({});
  const [editingCellsValuesMap, setEditingCellsValuesMap] = useState({});

  const handleCellClickToEdit = useCallback((clicked, element, cellProps) => {
    setEditingCellsMap(prevState => ({
      ...prevState,
      [cellProps.key]: true,
    }));
  }, []);

  return {
    handleCellClickToEdit,
  };
};
