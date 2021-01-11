import React from "react";
import { t } from "ttag";
import cx from "classnames";

import DashboardSharingEmbeddingModal from "../containers/DashboardSharingEmbeddingModal.jsx";
import FullscreenIcon from "metabase/components/icons/FullscreenIcon";
import Icon from "metabase/components/Icon";
import MetabaseSettings from "metabase/lib/settings";
import NightModeIcon from "metabase/components/icons/NightModeIcon";
import PopoverWithTrigger from "metabase/components/PopoverWithTrigger";
import RefreshWidget from "metabase/dashboard/components/RefreshWidget";
import Tooltip from "metabase/components/Tooltip";

export const getDashboardActions = (
  self,
  {
    dashboard,
    isAdmin,
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
    dashcardData,
  },
) => {
  const isPublicLinksEnabled = MetabaseSettings.get("enable-public-sharing");
  const isEmbeddingEnabled = MetabaseSettings.get("enable-embedding");

  const buttons = [];

  /* we consider the dashboard to be shareable if there is at least one card with data in it on the dashboard
    markdown cards don't appear in dashcardData so we check to see if there is at least one value
  */
  const canShareDashboard = Object.keys(dashcardData).length > 0;

  if (!isEditing && !isEmpty) {
    const extraButtonClassNames =
      "bg-brand-hover text-white-hover py2 px3 text-bold block cursor-pointer";

    buttons.push(
      <PopoverWithTrigger
        ref="popover"
        disabled={!canShareDashboard}
        triggerElement={
          <Tooltip
            tooltip={
              canShareDashboard
                ? t`Sharing`
                : t`Add data to share this dashboard`
            }
          >
            <Icon
              name="share"
              className={cx({
                "text-brand-hover": canShareDashboard,
                "text-light": !canShareDashboard,
              })}
            />
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
              {t`Dashboard subscriptions`}
            </a>
          </div>
          <div>
            <DashboardSharingEmbeddingModal
              additionalClickActions={() => self.refs.popover.close()}
              dashboard={dashboard}
              enabled={
                !isEditing &&
                !isFullscreen &&
                ((isPublicLinksEnabled && (isAdmin || dashboard.public_uuid)) ||
                  (isEmbeddingEnabled && isAdmin))
              }
              linkClassNames={extraButtonClassNames}
              linkText={t`Sharing and embedding`}
              key="dashboard-embed"
            />
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
