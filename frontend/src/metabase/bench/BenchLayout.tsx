import type { ReactNode } from "react";
import { withRouter } from "react-router";

import { Box, Flex, ThemeProvider } from "metabase/ui";

import { BenchSidebar } from "./components";

interface BenchLayoutProps {
  children: ReactNode;
}

function BenchLayoutComponent({ children }: BenchLayoutProps) {
  return (
    <ThemeProvider>
      <Box
        style={{
          height: "100vh",
          overflow: "hidden",
        }}
      >
        <Flex h="100%">
          <BenchSidebar />
          <Box flex="1" style={{ overflow: "hidden" }}>
            {children}
          </Box>
        </Flex>
      </Box>
    </ThemeProvider>
  );
}

export const BenchLayout = withRouter(BenchLayoutComponent);
