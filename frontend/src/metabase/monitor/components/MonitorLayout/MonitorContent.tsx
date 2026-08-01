import {
  type ReactNode,
  createContext,
  useContext,
  useMemo,
  useState,
} from "react";

import { AreaMain } from "metabase/nav/components/AreaLayout";
import { Box } from "metabase/ui";

type MonitorContentProps = {
  children?: ReactNode;
};

type MonitorSidebarContextValue = {
  sidebarNode: HTMLDivElement | null;
};

const MonitorSidebarContext = createContext<MonitorSidebarContextValue | null>(
  null,
);

export function useMonitorSidebarContext() {
  const context = useContext(MonitorSidebarContext);

  if (context == null) {
    throw new Error("Sidebar must be used within MonitorContent");
  }

  return context;
}

export function MonitorContent({ children }: MonitorContentProps) {
  const [sidebarNode, setSidebarNode] = useState<HTMLDivElement | null>(null);
  const contextValue = useMemo(() => ({ sidebarNode }), [sidebarNode]);

  return (
    <MonitorSidebarContext.Provider value={contextValue}>
      <AreaMain
        testId="monitor-main"
        sidebar={
          <Box
            data-testid="monitor-sidebar-region"
            ref={setSidebarNode}
            h="100%"
            display="flex"
            flex="0 0 auto"
          />
        }
      >
        {children}
      </AreaMain>
    </MonitorSidebarContext.Provider>
  );
}
