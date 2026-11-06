import type { ReactNode } from "react";

import { Box } from "metabase/ui";

interface LegendActionsProps {
  children?: ReactNode;
}

export const LegendActions = ({ children }: LegendActionsProps) => {
  return (
    <Box pos="relative" flex="0 0 auto" ml="auto">
      {children}
    </Box>
  );
};
