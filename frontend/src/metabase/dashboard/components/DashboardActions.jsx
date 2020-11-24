import React from "react";
import { t } from "ttag";

import FullscreenIcon from "metabase/components/icons/FullscreenIcon";
import Icon from "metabase/components/Icon";
import NightModeIcon from "metabase/components/icons/NightModeIcon";
import PopoverWithTrigger from "metabase/components/PopoverWithTrigger";
import RefreshWidget from "metabase/dashboard/components/RefreshWidget";
import Tooltip from "metabase/components/Tooltip";

export const getDashboardActions = (
  self,
  {
    isEditing = false,
    isEmpty = false,
    isFullscreen,
    isNightMode,
    onNightModeChange,
    onFullscreenChange,
    refreshPeriod,
    setRefreshElapsedHook,
    onRefreshPeriodChange,
    onSharingClick,
    onEmbeddingClick,
  },
) => {
  const buttons = [];

  if (!isEditing && !isEmpty) {
    const extraButtonClassNames =
      "bg-brand-hover text-white-hover py2 px3 text-bold block cursor-pointer";

    buttons.push(
      <PopoverWithTrigger
        ref="popover"
        triggerElement={
          <Tooltip tooltip={t`Sharing`}>
            <Icon name="share" className="text-brand-hover" />
          </Tooltip>
        }
      >
        <div className="py1">
          <div>
            <a
              className={extraButtonClassNames}
              data-metabase-event={"Dashboard;Subscriptions"}
              onClick={() => {
                self.refs.popover.close();
                onSharingClick();
              }}
            >
              {t`Create a dashboard subscription`}
            </a>
          </div>
          <div>
            <a
              className={extraButtonClassNames}
              data-metabase-event={"Dashboard;Sharing"}
              onClick={() => {
                self.refs.popover.close();
                onEmbeddingClick();
              }}
            >
              {t`Sharing and embedding`}
            </a>
          </div>
        </div>
      </PopoverWithTrigger>,
    );
  }

  if (!isEditing && !isEmpty) {
    buttons.push(
      <RefreshWidget
        key="refresh"
        data-metabase-event="Dashboard;Refresh Menu Open"
        className="text-brand-hover"
        period={refreshPeriod}
        setRefreshElapsedHook={setRefreshElapsedHook}
        onChangePeriod={onRefreshPeriodChange}
      />,
    );
  }

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

  if (!isEditing && !isEmpty) {
    // option click to enter fullscreen without making the browser go fullscreen
    buttons.push(
      <Tooltip
        key="fullscreen"
        tooltip={isFullscreen ? t`Exit fullscreen` : t`Enter fullscreen`}
      >
        <span
          data-metabase-event={"Dashboard;Fullscreen Mode;" + !isFullscreen}
        >
          <FullscreenIcon
            className="text-brand-hover cursor-pointer"
            isFullscreen={isFullscreen}
            onClick={e => onFullscreenChange(!isFullscreen, !e.altKey)}
          />
        </span>
      </Tooltip>,
    );
  }

  return buttons;
};
