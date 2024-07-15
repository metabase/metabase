import { t } from "ttag";

import type { DashboardFullscreenControls } from "metabase/dashboard/types";

import { DashboardHeaderButton } from "../DashboardHeaderButton";

export const FullscreenToggle = ({
  isFullscreen,
  onFullscreenChange,
}: DashboardFullscreenControls) => {
  const label = isFullscreen ? t`Exit fullscreen` : t`Enter fullscreen`;
  return (
    <DashboardHeaderButton
      tooltipLabel={label}
      icon={isFullscreen ? "contract" : "expand"}
      onClick={e => onFullscreenChange(!isFullscreen, !e.altKey)}
      aria-label={label}
    />
  );
};
