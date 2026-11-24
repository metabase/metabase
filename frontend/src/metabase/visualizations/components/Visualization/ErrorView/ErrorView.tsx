import { type ReactNode, forwardRef } from "react";

import { Box, Icon, Tooltip } from "metabase/ui";
import type { IconName } from "metabase-types/api";

import { StateView } from "../StateView";

interface ErrorViewProps {
  error: ReactNode;
  icon?: IconName;
  isSmall?: boolean;
}

export const ErrorView = forwardRef<HTMLDivElement, ErrorViewProps>(
  function ErrorView({ error, icon = "warning", isSmall }, ref) {
    return (
      <StateView ref={ref} c="text-secondary">
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
