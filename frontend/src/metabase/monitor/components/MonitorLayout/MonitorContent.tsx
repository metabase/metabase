import {
  type ReactNode,
  createContext,
  useContext,
  useMemo,
  useState,
} from "react";

import { AppSwitcher } from "metabase/nav/components/AppSwitcher";
import {
  AreaContent,
  CONTENT_PADDING_X,
} from "metabase/nav/components/AreaLayout";
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
      <Box
        h="100%"
        bg="background_page-secondary"
        display="flex"
        style={{ overflow: "hidden" }}
      >
        <Box
          data-testid="monitor-main"
          h="100%"
          pos="relative"
          flex="1 1 auto"
          miw={0}
        >
          <Box
            pos="absolute"
            top="1.5rem"
            right={CONTENT_PADDING_X}
            bg="background_page-secondary"
            bdrs="50%"
            style={{ zIndex: 10 }}
          >
            <AppSwitcher />
          </Box>
          <AreaContent>{children}</AreaContent>
        </Box>
        <Box
          data-testid="monitor-sidebar-region"
          ref={setSidebarNode}
          h="100%"
          display="flex"
          flex="0 0 auto"
        />
      </Box>
    </MonitorSidebarContext.Provider>
  );
}
