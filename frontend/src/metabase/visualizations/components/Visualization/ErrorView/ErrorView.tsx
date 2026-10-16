import { type ReactNode, forwardRef } from "react";

import { Box, Icon, Tooltip } from "metabase/ui";
import type { IconName } from "metabase-types/api";

import { StateView } from "../StateView";

interface ErrorViewProps {
  error: ReactNode;
  icon?: IconName;
  isDashboard?: boolean;
  isSmall?: boolean;
}

export const ErrorView = forwardRef<HTMLDivElement, ErrorViewProps>(
  function ErrorView({ error, icon = "warning", isDashboard, isSmall }, ref) {
    return (
      <StateView ref={ref} c={isDashboard ? "text-secondary" : "text-disabled"}>
        <Tooltip label={error} disabled={!isSmall}>
          <Icon name={icon} size={50} mb="lg" />
        </Tooltip>
        {!isSmall && (
          <Box component="span" fw="bold" fz="1.12em">
            {error}
          </Box>
        )}
      </StateView>
    );
  },
);
