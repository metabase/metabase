import { t } from "ttag";

import { ToolbarButton } from "metabase/common/components/ToolbarButton";
import CS from "metabase/css/core/index.css";
import { useDashboardContext } from "metabase/dashboard/context/context";

export const FullscreenAnalyticsDashboard = () => {
  const { isFullscreen, onFullscreenChange } = useDashboardContext();

  return (
    <ToolbarButton
      key="expand"
      aria-label={t`Enter Fullscreen`}
      icon="expand"
      className={CS.cursorPointer}
      onClick={(e) => onFullscreenChange(!isFullscreen, !e.altKey)}
    />
  );
};
