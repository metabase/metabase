import { type ReactNode, createContext, useContext, useState } from "react";

type PropertySelection = {
  selectedPropertyName: string | null;
  setSelectedPropertyName: (propertyName: string | null) => void;
};

const PropertySelectionContext = createContext<PropertySelection>({
  selectedPropertyName: null,
  setSelectedPropertyName: () => undefined,
});

export function PropertySelectionProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [selectedPropertyName, setSelectedPropertyName] = useState<
    string | null
  >(null);
  return (
    <PropertySelectionContext.Provider
      value={{ selectedPropertyName, setSelectedPropertyName }}
    >
      {children}
    </PropertySelectionContext.Provider>
  );
}

export function usePropertySelection() {
  return useContext(PropertySelectionContext);
}
