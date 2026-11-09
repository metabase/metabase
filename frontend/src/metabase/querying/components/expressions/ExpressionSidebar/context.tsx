import type { ReactNode } from "react";
import { createContext, useContext, useMemo, useState } from "react";

export type ExpressionSidebarName = "functions" | "columns";

export type ExpressionSidebarHost = {
  openSidebar: ExpressionSidebarName | null;
  setOpenSidebar: (name: ExpressionSidebarName | null) => void;
  container: HTMLElement | null;
  setContainer: (element: HTMLElement | null) => void;
};

const ExpressionSidebarContext = createContext<ExpressionSidebarHost | null>(
  null,
);

/**
 * Lets a host render the editor's sidebar in its own slot. The editor portals
 * into `container`, so the sidebar stays in its React tree and can type into
 * its CodeMirror instance. No provider means the editor uses its own layout.
 */
export function ExpressionSidebarProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [openSidebar, setOpenSidebar] = useState<ExpressionSidebarName | null>(
    null,
  );
  const [container, setContainer] = useState<HTMLElement | null>(null);

  const value = useMemo(
    () => ({ openSidebar, setOpenSidebar, container, setContainer }),
    [openSidebar, container],
  );

  return (
    <ExpressionSidebarContext.Provider value={value}>
      {children}
    </ExpressionSidebarContext.Provider>
  );
}

export function useExpressionSidebarHost() {
  return useContext(ExpressionSidebarContext);
}
