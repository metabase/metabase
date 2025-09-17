import { t } from "ttag";

import { ToolbarButton } from "metabase/common/components/ToolbarButton";
import { useDashboardContext } from "metabase/dashboard/context/context";

export const FullscreenToggle = () => {
  const { isFullscreen, onFullscreenChange } = useDashboardContext();
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
