import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

interface BenchLayoutContextValue {
  onTogglePanel?: () => void;
  isPanelCollapsed?: boolean;
  registerPanelControl: (
    onToggle: () => void,
    isCollapsed: boolean,
  ) => () => void;
}

const BenchLayoutContext = createContext<BenchLayoutContextValue | null>(null);

export function BenchLayoutProvider({ children }: { children: ReactNode }) {
  const [panelControl, setPanelControl] = useState<{
    onToggle: () => void;
    isCollapsed: boolean;
  } | null>(null);

  const registerPanelControl = useCallback(
    (onToggle: () => void, isCollapsed: boolean) => {
      setPanelControl({ onToggle, isCollapsed });
      return () => setPanelControl(null);
    },
    [],
  );

  const contextValue = useMemo(
    () => ({
      onTogglePanel: panelControl?.onToggle,
      isPanelCollapsed: panelControl?.isCollapsed,
      registerPanelControl,
    }),
    [panelControl?.onToggle, panelControl?.isCollapsed, registerPanelControl],
  );

  return (
    <BenchLayoutContext.Provider value={contextValue}>
      {children}
    </BenchLayoutContext.Provider>
  );
}

export function useBenchLayoutContext() {
  const context = useContext(BenchLayoutContext);
  if (!context) {
    throw new Error(
      "useBenchLayoutContext must be used within BenchLayoutProvider",
    );
  }
  return context;
}
