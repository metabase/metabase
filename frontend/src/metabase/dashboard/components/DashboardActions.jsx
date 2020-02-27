import React from "react";
import { t } from "ttag";
import Tooltip from "metabase/components/Tooltip";
import NightModeIcon from "metabase/components/icons/NightModeIcon";

export const getDashboardActions = ({
  isEditing = false,
  isEmpty = false,
  isFullscreen,
  isNightMode,
  onNightModeChange,
  onFullscreenChange,
  refreshPeriod,
  setRefreshElapsedHook,
  onRefreshPeriodChange,
}) => {
  const buttons = [];

  if (!isEditing && isFullscreen) {
    buttons.push(
      <Tooltip
        key="night"
        tooltip={isNightMode ? t`Daytime mode` : t`Nighttime mode`}
      >
        <span data-metabase-event={"Dashboard;Night Mode;" + !isNightMode}>
          <NightModeIcon
            className="text-brand-hover cursor-pointer"
            isNightMode={isNightMode}
            onClick={() => onNightModeChange(!isNightMode)}
          />
        </span>
      </Tooltip>,
    );
  }

  return buttons;
};
