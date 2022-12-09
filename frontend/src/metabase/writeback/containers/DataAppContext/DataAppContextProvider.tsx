import React, { useCallback, useMemo, useState } from "react";
import _ from "lodash";

import { DataAppContext, DataAppContextType } from "./DataAppContext";

interface DataAppContextProviderProps {
  children: React.ReactNode;
}

function DataAppContextProvider({ children }: DataAppContextProviderProps) {
  const [bulkActionCardId, setBulkActionCardId] = useState<number | null>(null);
  const [selectedRows, setSelectedRows] = useState<number[]>([]);

  const handleRowSelected = useCallback(
    (cardId: number, rowIndex: number) => {
      if (bulkActionCardId !== cardId) {
        setBulkActionCardId(cardId);
        setSelectedRows([rowIndex]);
      } else {
        setSelectedRows(rows => rows.concat(rowIndex));
      }
    },
    [bulkActionCardId],
  );

  const handleRowDeselected = useCallback(
    (rowIndex: number) => {
      const nextRows = selectedRows.filter(row => row !== rowIndex);
      setSelectedRows(nextRows);
      if (nextRows.length === 0) {
        setBulkActionCardId(null);
      }
    },
    [selectedRows],
  );

  const handleClearSelection = useCallback(() => {
    setSelectedRows([]);
    setBulkActionCardId(null);
  }, []);

  const context: DataAppContextType = useMemo(
    () => ({
      bulkActions: {
        cardId: bulkActionCardId,
        selectedRowIndexes: selectedRows,
        addRow: handleRowSelected,
        removeRow: handleRowDeselected,
        clearSelection: handleClearSelection,
      },
    }),
    [
      bulkActionCardId,
      selectedRows,
      handleRowSelected,
      handleRowDeselected,
      handleClearSelection,
    ],
  );

  return (
    <DataAppContext.Provider value={context}>
      {children}
    </DataAppContext.Provider>
  );
}

export default DataAppContextProvider;
