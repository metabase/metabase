import { t } from "ttag";

import CS from "metabase/css/core/index.css";
import type { DashboardFullscreenControls } from "metabase/dashboard/types";

import { DashboardHeaderButton } from "../DashboardHeaderButton";

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
