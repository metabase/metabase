import type { ReactNode } from "react";

import CS from "metabase/css/core/index.css";
import { Box } from "metabase/ui";

export const PerformancePageContent = ({
  children,
}: {
  children: ReactNode;
}) => (
  <Box p="2rem" h="100%" flex={1} miw={0} className={CS.overflowYAuto}>
    <Box maw="60rem" w="100%" mx="auto">
      {children}
    </Box>
  </Box>
);
