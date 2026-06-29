import {
  type Dispatch,
  type ReactNode,
  type SetStateAction,
  createContext,
  useContext,
  useMemo,
  useState,
} from "react";

import ErrorBoundary from "metabase/ErrorBoundary";
import { AppSwitcher } from "metabase/nav/components/AppSwitcher";
import { Box } from "metabase/ui";

const CONTENT_PADDING_X = "3.5rem";
const CONTENT_PADDING_RIGHT_WITH_APP_SWITCHER = "7rem";

type MonitorContentProps = {
  children?: ReactNode;
};

type MonitorSidebarContextValue = {
  setSidebar: Dispatch<SetStateAction<ReactNode>>;
};

const MonitorSidebarContext = createContext<MonitorSidebarContextValue | null>(
  null,
);

export function useMonitorSidebar() {
  const context = useContext(MonitorSidebarContext);

  if (context == null) {
    throw new Error("useMonitorSidebar must be used within MonitorContent");
  }

  return context;
}

export function MonitorContent({ children }: MonitorContentProps) {
  const [sidebar, setSidebar] = useState<ReactNode>(null);
  const contextValue = useMemo(() => ({ setSidebar }), [setSidebar]);

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
            bdrs="md"
            style={{ zIndex: 10 }}
          >
            <AppSwitcher />
          </Box>
          <Box
            h="100%"
            pl={CONTENT_PADDING_X}
            pr={CONTENT_PADDING_RIGHT_WITH_APP_SWITCHER}
            py="1.5rem"
            style={{ overflowY: "auto" }}
          >
            <ErrorBoundary>{children}</ErrorBoundary>
          </Box>
        </Box>
        {sidebar != null && (
          <Box
            data-testid="monitor-sidebar-region"
            h="100%"
            display="flex"
            flex="0 0 auto"
          >
            <ErrorBoundary>{sidebar}</ErrorBoundary>
          </Box>
        )}
      </Box>
    </MonitorSidebarContext.Provider>
  );
}
