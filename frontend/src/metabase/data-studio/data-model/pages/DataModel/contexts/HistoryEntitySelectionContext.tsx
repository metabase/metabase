import { type ReactNode, createContext, useContext, useState } from "react";

import type { HistoryCheckId } from "metabase/metadata/table-structure";
import type { TableId } from "metabase-types/api";

type SelectedCheck = { tableId: TableId; checkId: HistoryCheckId };

type HistoryEntitySelection = {
  selectedEntityKey: string | null;
  setSelectedEntityKey: (entityKey: string | null) => void;
  selectedCheck: SelectedCheck | null;
  setSelectedCheck: (check: SelectedCheck | null) => void;
};

const HistoryEntitySelectionContext = createContext<HistoryEntitySelection>({
  selectedEntityKey: null,
  setSelectedEntityKey: () => undefined,
  selectedCheck: null,
  setSelectedCheck: () => undefined,
});

export function HistoryEntitySelectionProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [selectedEntityKey, setSelectedEntityKey] = useState<string | null>(
    null,
  );
  const [selectedCheck, setSelectedCheck] = useState<SelectedCheck | null>(
    null,
  );
  return (
    <HistoryEntitySelectionContext.Provider
      value={{
        selectedEntityKey,
        setSelectedEntityKey,
        selectedCheck,
        setSelectedCheck,
      }}
    >
      {children}
    </HistoryEntitySelectionContext.Provider>
  );
}

export function useHistoryEntitySelection() {
  return useContext(HistoryEntitySelectionContext);
}

export function useHistoryCheckSelection(tableId: TableId | undefined) {
  const { selectedCheck, setSelectedCheck, setSelectedEntityKey } = useContext(
    HistoryEntitySelectionContext,
  );
  const selectedCheckId =
    selectedCheck != null && selectedCheck.tableId === tableId
      ? selectedCheck.checkId
      : null;
  const selectCheck = (checkId: HistoryCheckId | null) => {
    setSelectedEntityKey(null);
    setSelectedCheck(
      checkId != null && tableId != null ? { tableId, checkId } : null,
    );
  };
  return { selectedCheckId, selectCheck };
}
