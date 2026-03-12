import {
  type Dispatch,
  type ReactNode,
  type SetStateAction,
  createContext,
  useCallback,
  useContext,
  useState,
} from "react";

import type { DatabaseId, TableId } from "metabase-types/api";

interface SelectionContextValue {
  selectedTables: Set<TableId>;
  setSelectedTables: Dispatch<SetStateAction<Set<TableId>>>;
  selectedSchemas: Set<string>;
  setSelectedSchemas: Dispatch<SetStateAction<Set<string>>>;
  selectedDatabases: Set<DatabaseId>;
  setSelectedDatabases: Dispatch<SetStateAction<Set<DatabaseId>>>;
  resetSelection: () => void;
  hasSelectedItems: boolean;
  selectedItemsCount: number;
  hasOnlyOneTableSelected: boolean;
  hasSelectedMoreThanOneTable: boolean;
  filterSelectedTables: (tables: TableId[]) => void;
}

const SelectionContext = createContext<SelectionContextValue | null>(null);

export function SelectionProvider({ children }: { children: ReactNode }) {
  const [selectedTables, setSelectedTables] = useState<Set<TableId>>(new Set());
  const [selectedSchemas, setSelectedSchemas] = useState<Set<string>>(
    new Set(),
  );
  const [selectedDatabases, setSelectedDatabases] = useState<Set<DatabaseId>>(
    new Set(),
  );

  const resetSelection = useCallback(() => {
    setSelectedTables(new Set());
    setSelectedSchemas(new Set());
    setSelectedDatabases(new Set());
  }, []);

  const filterSelectedTables = useCallback((tables: TableId[]) => {
    setSelectedTables(
      (oldTables) =>
        new Set([...oldTables].filter((tableId) => tables.includes(tableId))),
    );
  }, []);

  const hasSelectedItems =
    selectedTables.size > 0 ||
    selectedSchemas.size > 0 ||
    selectedDatabases.size > 0;

  const selectedItemsCount =
    selectedTables.size + selectedSchemas.size + selectedDatabases.size;

  const hasOnlyOneTableSelected =
    selectedTables.size === 1 &&
    selectedSchemas.size === 0 &&
    selectedDatabases.size === 0;

  const hasSelectedMoreThanOneTable =
    selectedItemsCount > 1 && !hasOnlyOneTableSelected;

  return (
    <SelectionContext.Provider
      value={{
        selectedTables,
        setSelectedTables,
        selectedSchemas,
        setSelectedSchemas,
        selectedDatabases,
        setSelectedDatabases,
        resetSelection,
        hasSelectedItems,
        selectedItemsCount,
        hasOnlyOneTableSelected,
        hasSelectedMoreThanOneTable,
        filterSelectedTables,
      }}
    >
      {children}
    </SelectionContext.Provider>
  );
}

export function useSelection() {
  const context = useContext(SelectionContext);
  if (!context) {
    throw new Error("useSelection must be used within a SelectionProvider");
  }
  return context;
}
