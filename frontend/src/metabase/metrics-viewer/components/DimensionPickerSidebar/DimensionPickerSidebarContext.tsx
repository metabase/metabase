import {
  type ReactNode,
  createContext,
  useContext,
  useMemo,
  useState,
} from "react";

type DimensionPickerSidebarContextValue = {
  isOpen: boolean;
  open: () => void;
  close: () => void;
};

const DimensionPickerSidebarContext =
  createContext<DimensionPickerSidebarContextValue | null>(null);

export function DimensionPickerSidebarProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(false);

  const value = useMemo(
    () => ({
      isOpen,
      open: () => setIsOpen(true),
      close: () => setIsOpen(false),
    }),
    [isOpen],
  );

  return (
    <DimensionPickerSidebarContext.Provider value={value}>
      {children}
    </DimensionPickerSidebarContext.Provider>
  );
}

export function useDimensionPickerSidebar() {
  const context = useContext(DimensionPickerSidebarContext);
  if (!context) {
    throw new Error(
      "useDimensionPickerSidebar must be used within DimensionPickerSidebarProvider",
    );
  }

  return context;
}
