import { t } from "ttag";

import Tooltip from "metabase/core/components/Tooltip";
import type { DashboardFullscreenControls } from "metabase/dashboard/types";

import { FullScreenButtonIcon } from "../../DashboardActions.styled";
import { DashboardHeaderButton } from "../DashboardHeader.styled";

export const FullscreenToggle = ({
  isFullscreen,
  onFullscreenChange,
}: DashboardFullscreenControls) => (
  <Tooltip tooltip={isFullscreen ? t`Exit fullscreen` : t`Enter fullscreen`}>
    <span>
      <DashboardHeaderButton
        icon={<FullScreenButtonIcon isFullscreen={isFullscreen} />}
        onClick={e => onFullscreenChange(!isFullscreen, !e.altKey)}
      />
    </span>
  </Tooltip>
);
