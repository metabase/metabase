import { t } from "ttag";

import { ToolbarButton } from "metabase/components/ToolbarButton";
import CS from "metabase/css/core/index.css";
import type { DashboardFullscreenControls } from "metabase/dashboard/types";

export const FullscreenAnalyticsDashboard = ({
  isFullscreen,
  onFullscreenChange,
}: DashboardFullscreenControls) => (
  <ToolbarButton
    key="expand"
    aria-label={t`Enter Fullscreen`}
    icon="expand"
    className={CS.cursorPointer}
    onClick={e => onFullscreenChange(!isFullscreen, !e.altKey)}
  />
);
