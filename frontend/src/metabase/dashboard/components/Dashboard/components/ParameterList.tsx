import { forwardRef } from "react";

import { useDashboardContext } from "metabase/dashboard/context";
import { Box } from "metabase/ui";

import { DashboardParameterList } from "../../DashboardParameterList";

export const ParameterList = forwardRef(function _ParameterList(
  { className }: { className?: string },
  ref,
) {
  const { isFullscreen } = useDashboardContext();

  return (
    <Box ref={ref}>
      <DashboardParameterList
        className={className}
        isFullscreen={isFullscreen}
      />
    </Box>
  );
});
