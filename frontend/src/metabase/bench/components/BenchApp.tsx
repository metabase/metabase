import type React from "react";

import { Box, Flex } from "metabase/ui";

import { BenchAppBar } from "./BenchAppBar";
import { BenchNav } from "./BenchNav";

export const BenchApp = ({ children }: { children: React.ReactNode }) => {
  return (
    <Box h="100vh" style={{ width: "100%", overflow: "hidden" }}>
      <BenchAppBar
        onMetabotToggle={() => {}}
        isMetabotOpen={false}
        onSidebarToggle={() => {}}
        isSidebarOpen={false}
      />
      <Flex h="100%">
        <BenchNav />
        <Box w="100%" data-testid="bench-main-content">
          {children}
        </Box>
      </Flex>
    </Box>
  );
};
