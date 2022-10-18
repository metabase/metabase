import { useCallback, useMemo, useState } from "react";

import type { TableId } from "metabase-types/api";

interface SelectedTablesHookOpts {
  initialValues?: TableId[];
  mode?: "single" | "multiple";
}

function useSelectedTables({
  initialValues = [],
  mode = "single",
}: SelectedTablesHookOpts = {}) {
  const [selectedTableIds, setSelectedTableIds] = useState(
    new Set(initialValues),
  );

  const addSelectedTableId = useCallback(
    (id: TableId) => {
      if (mode === "multiple") {
        setSelectedTableIds(prev => new Set([...prev, id]));
      } else {
        setSelectedTableIds(new Set([id]));
      }
    },
    [mode],
  );

  const removeSelectedTableId = useCallback(
    (id: TableId) => {
      if (selectedTableIds.has(id)) {
        setSelectedTableIds(prev => new Set([...prev].filter(i => i !== id)));
      }
    },
    [selectedTableIds],
  );

  const toggleTableIdSelection = useCallback(
    (id: TableId) => {
      if (selectedTableIds.has(id)) {
        removeSelectedTableId(id);
      } else {
        addSelectedTableId(id);
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

export default useSelectedTables;
