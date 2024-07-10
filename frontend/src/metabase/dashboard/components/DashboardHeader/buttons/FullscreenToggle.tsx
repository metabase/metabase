import { t } from "ttag";

import Tooltip from "metabase/core/components/Tooltip";
import { FullScreenButtonIcon } from "metabase/dashboard/components/DashboardActions.styled";
import { DashboardHeaderButton } from "metabase/dashboard/components/DashboardHeader/DashboardHeader.styled";
import type { DashboardFullscreenControls } from "metabase/dashboard/types";

export const FullscreenToggle = ({
  isFullscreen,
  onFullscreenChange,
}: DashboardFullscreenControls) => (
  <Tooltip
    key="fullscreen"
    tooltip={isFullscreen ? t`Exit fullscreen` : t`Enter fullscreen`}
  >
    <span>
      <DashboardHeaderButton
        icon={<FullScreenButtonIcon isFullscreen={isFullscreen} />}
        onClick={e => onFullscreenChange(!isFullscreen, !e.altKey)}
      />
    </span>
  </Tooltip>
);
