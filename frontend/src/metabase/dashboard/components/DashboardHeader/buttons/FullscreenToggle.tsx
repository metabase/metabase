import { t } from "ttag";

import { ToolbarButton } from "metabase/components/ToolbarButton";
import type { DashboardFullscreenControls } from "metabase/dashboard/types";

export const FullscreenToggle = ({
  isFullscreen,
  onFullscreenChange,
}: DashboardFullscreenControls) => {
  const label = isFullscreen ? t`Exit fullscreen` : t`Enter fullscreen`;
  return (
    <ToolbarButton
      tooltipLabel={label}
      icon={isFullscreen ? "contract" : "expand"}
      onClick={(e) => onFullscreenChange(!isFullscreen, !e.altKey)}
      aria-label={label}
    />
  );
};
