import {
  type PropsWithChildren,
  type ReactNode,
  createContext,
  useMemo,
} from "react";

type PaneHeaderControls = {
  appSwitcher?: ReactNode;
  metabotButton?: ReactNode;
};

// Data Studio supplies these controls at its layout boundary. Metric pages
// outside Data Studio can use the same header without application controls.
export const PaneHeaderControlsContext = createContext<PaneHeaderControls>({});

export function PaneHeaderControlsProvider({
  appSwitcher,
  metabotButton,
  children,
}: PropsWithChildren<PaneHeaderControls>) {
  const controls = useMemo(
    () => ({ appSwitcher, metabotButton }),
    [appSwitcher, metabotButton],
  );

  return (
    <PaneHeaderControlsContext.Provider value={controls}>
      {children}
    </PaneHeaderControlsContext.Provider>
  );
}
