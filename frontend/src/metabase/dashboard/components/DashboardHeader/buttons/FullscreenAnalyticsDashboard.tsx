import { t } from "ttag";

import CS from "metabase/css/core/index.css";
import { DashboardHeaderButton } from "metabase/dashboard/components/DashboardHeader/DashboardHeader.styled";
import type { DashboardFullscreenControls } from "metabase/dashboard/types";

export const FullscreenAnalyticsDashboard = ({
  isFullscreen,
  onFullscreenChange,
}: DashboardFullscreenControls) => (
  <DashboardHeaderButton
    key="expand"
    aria-label={t`Enter Fullscreen`}
    icon="expand"
    className={CS.cursorPointer}
    onClick={e => onFullscreenChange(!isFullscreen, !e.altKey)}
  />
);
