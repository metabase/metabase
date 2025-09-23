import type { ReactNode } from "react";
import { withRouter } from "react-router";

import { Box, Flex, ThemeProvider } from "metabase/ui";

import { BenchSidebar } from "./components";
import { useDarkMode } from "./hooks/useDarkMode";

interface BenchLayoutProps {
  children: ReactNode;
}

function BenchLayoutComponent({ children }: BenchLayoutProps) {
  const isDarkMode = useDarkMode();

  return (
    <ThemeProvider>
      <Box
        style={{
          height: "100vh",
          overflow: "hidden",
        }}
      >
        <Flex h="100%">
          <BenchSidebar isDarkMode={isDarkMode} />
          <Box flex="1" style={{ overflow: "hidden" }}>
            {children}
          </Box>
        </Flex>
      </Box>
    </ThemeProvider>
  );
}

export const BenchLayout = withRouter(BenchLayoutComponent);
