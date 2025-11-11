import { type ReactNode, createContext, useContext, useState } from "react";

import type { DatabaseId, FieldId, TableId } from "metabase-types/api";

interface SelectionContextValue {
  selectedTables: Set<TableId>;
  setSelectedTables: (tables: Set<TableId>) => void;
  selectedSchemas: Set<string>;
  setSelectedSchemas: (schemas: Set<string>) => void;
  selectedDatabases: Set<DatabaseId>;
  setSelectedDatabases: (databases: Set<DatabaseId>) => void;
  selectedFields: Set<FieldId>;
  setSelectedFields: (fields: Set<FieldId>) => void;
  resetSelection: () => void;
  hasSelectedItems: boolean;
  selectedItemsCount: number;
  hasOnlyOneTableSelected: boolean;
  hasSelectedMoreThanOneTable: boolean;
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
  const [selectedFields, setSelectedFields] = useState<Set<FieldId>>(new Set());

  const resetSelection = () => {
    setSelectedTables(new Set());
    setSelectedSchemas(new Set());
    setSelectedDatabases(new Set());
    setSelectedFields(new Set());
  };

  const hasSelectedItems =
    selectedTables.size > 0 ||
    selectedSchemas.size > 0 ||
    selectedDatabases.size > 0 ||
    selectedFields.size > 0;

  const selectedItemsCount =
    selectedTables.size +
    selectedSchemas.size +
    selectedDatabases.size +
    selectedFields.size;

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
        selectedFields,
        setSelectedFields,
        resetSelection,
        hasSelectedItems,
        selectedItemsCount,
        hasOnlyOneTableSelected,
        hasSelectedMoreThanOneTable,
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
