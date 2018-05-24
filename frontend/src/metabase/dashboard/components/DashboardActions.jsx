import React from "react";
import { t } from "c-3po";
import Tooltip from "metabase/components/Tooltip";
import NightModeIcon from "metabase/components/icons/NightModeIcon";
import FullscreenIcon from "metabase/components/icons/FullscreenIcon";
import RefreshWidget from "metabase/dashboard/components/RefreshWidget";

export const getDashboardActions = ({
  isEditing = false,
  isEmpty = false,
  isFullscreen,
  isNightMode,
  onNightModeChange,
  onFullscreenChange,
  refreshPeriod,
  refreshElapsed,
  onRefreshPeriodChange,
}) => {
  const buttons = [];

  if (!isEditing && !isEmpty) {
    buttons.push(
      <RefreshWidget
        data-metabase-event="Dashboard;Refresh Menu Open"
        className="text-brand-hover"
        key="refresh"
        period={refreshPeriod}
        elapsed={refreshElapsed}
        onChangePeriod={onRefreshPeriodChange}
      />,
    );
  }

  if (!isEditing && isFullscreen) {
    buttons.push(
      <Tooltip tooltip={isNightMode ? t`Daytime mode` : t`Nighttime mode`}>
        <span data-metabase-event={"Dashboard;Night Mode;" + !isNightMode}>
          <NightModeIcon
            className="text-brand-hover cursor-pointer"
            key="night"
            isNightMode={isNightMode}
            onClick={() => onNightModeChange(!isNightMode)}
          />
        </span>
      </Tooltip>,
    );
  }

  if (!isEditing && !isEmpty) {
    // option click to enter fullscreen without making the browser go fullscreen
    buttons.push(
      <Tooltip
        tooltip={isFullscreen ? t`Exit fullscreen` : t`Enter fullscreen`}
      >
        <span
          data-metabase-event={"Dashboard;Fullscreen Mode;" + !isFullscreen}
        >
          <FullscreenIcon
            className="text-brand-hover cursor-pointer"
            key="fullscreen"
            isFullscreen={isFullscreen}
            onClick={e => onFullscreenChange(!isFullscreen, !e.altKey)}
          />
        </span>
      </Tooltip>,
    );
  }

  return buttons;
};
