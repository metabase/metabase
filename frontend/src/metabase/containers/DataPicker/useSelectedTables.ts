import { useCallback, useEffect, useMemo, useState } from "react";

import type { TableId } from "metabase-types/api";

interface SelectedTablesHookOpts {
  initialValues?: TableId[];
  isMultiSelect?: boolean;
}

function useSelectedTables({
  initialValues = [],
  isMultiSelect,
}: SelectedTablesHookOpts = {}) {
  const [selectedTableIds, setSelectedTableIds] = useState(
    new Set(initialValues),
  );

  useEffect(() => {
    setSelectedTableIds(new Set(initialValues));
  }, [initialValues]);

  const addSelectedTableId = useCallback(
    (id: TableId) => {
      const nextState = isMultiSelect
        ? new Set([...selectedTableIds, id])
        : new Set([id]);
      setSelectedTableIds(nextState);
      return Array.from(nextState);
    },
    [selectedTableIds, isMultiSelect],
  );

  const removeSelectedTableId = useCallback(
    (id: TableId) => {
      if (selectedTableIds.has(id)) {
        const nextState = new Set([...selectedTableIds].filter(i => i !== id));
        setSelectedTableIds(nextState);
        return Array.from(nextState);
      }
      return Array.from(selectedTableIds);
    },
    [selectedTableIds],
  );

  const toggleTableIdSelection = useCallback(
    (id: TableId) => {
      if (selectedTableIds.has(id)) {
        return removeSelectedTableId(id);
      } else {
        return addSelectedTableId(id);
      }
    },
    [selectedTableIds, addSelectedTableId, removeSelectedTableId],
  );

  const clearSelectedTables = useCallback(() => {
    setSelectedTableIds(new Set());
  }, []);

  const selectedTableIdList = useMemo(
    () => Array.from(selectedTableIds),
    [selectedTableIds],
  );

  return {
    selectedTableIds: selectedTableIdList,
    addSelectedTableId,
    removeSelectedTableId,
    toggleTableIdSelection,
    clearSelectedTables,
  };
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default useSelectedTables;
