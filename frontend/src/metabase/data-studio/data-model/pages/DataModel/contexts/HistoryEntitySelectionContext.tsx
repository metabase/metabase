import { type ReactNode, createContext, useContext, useState } from "react";

type HistoryEntitySelection = {
  selectedEntityKey: string | null;
  setSelectedEntityKey: (entityKey: string | null) => void;
};

const HistoryEntitySelectionContext = createContext<HistoryEntitySelection>({
  selectedEntityKey: null,
  setSelectedEntityKey: () => undefined,
});

export function HistoryEntitySelectionProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [selectedEntityKey, setSelectedEntityKey] = useState<string | null>(
    null,
  );
  return (
    <HistoryEntitySelectionContext.Provider
      value={{ selectedEntityKey, setSelectedEntityKey }}
    >
      {children}
    </HistoryEntitySelectionContext.Provider>
  );
}

export function useHistoryEntitySelection() {
  return useContext(HistoryEntitySelectionContext);
}
