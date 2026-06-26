import type { ReactNode } from "react";

import ErrorBoundary from "metabase/ErrorBoundary";
import { AppSwitcher } from "metabase/nav/components/AppSwitcher";
import { Box } from "metabase/ui";

type MonitorContentProps = {
  children?: ReactNode;
};

export function MonitorContent({ children }: MonitorContentProps) {
  return (
    <Box h="100%" pos="relative" bg="background_page-secondary">
      <Box
        pos="absolute"
        top="2rem"
        right="2rem"
        bg="background_page-secondary"
        bdrs="md"
        style={{ zIndex: 10 }}
      >
        <AppSwitcher />
      </Box>
      <Box h="100%" p="2rem" style={{ overflowY: "auto" }}>
        <ErrorBoundary>{children}</ErrorBoundary>
      </Box>
    </Box>
  );
}
