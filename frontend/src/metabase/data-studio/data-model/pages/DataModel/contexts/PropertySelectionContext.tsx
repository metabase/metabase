import { type ReactNode, createContext, useContext, useState } from "react";

import type { TableId } from "metabase-types/api";

type SelectedProperty = { tableId: TableId; propertyName: string };

type PropertySelectionState = {
  selectedProperty: SelectedProperty | null;
  setSelectedProperty: (selectedProperty: SelectedProperty | null) => void;
};

const PropertySelectionContext = createContext<PropertySelectionState>({
  selectedProperty: null,
  setSelectedProperty: () => undefined,
});

export function PropertySelectionProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [selectedProperty, setSelectedProperty] =
    useState<SelectedProperty | null>(null);
  return (
    <PropertySelectionContext.Provider
      value={{ selectedProperty, setSelectedProperty }}
    >
      {children}
    </PropertySelectionContext.Provider>
  );
}

/**
 * The property selected in `tableId`'s Properties tab. A selection made on
 * another table reads as none, so switching tables doesn't carry it over.
 */
export function usePropertySelection(tableId: TableId | undefined) {
  const { selectedProperty, setSelectedProperty } = useContext(
    PropertySelectionContext,
  );
  return {
    selectedPropertyName:
      tableId != null && selectedProperty?.tableId === tableId
        ? selectedProperty.propertyName
        : null,
    setSelectedPropertyName: (propertyName: string | null) =>
      setSelectedProperty(
        tableId != null && propertyName != null
          ? { tableId, propertyName }
          : null,
      ),
  };
}
