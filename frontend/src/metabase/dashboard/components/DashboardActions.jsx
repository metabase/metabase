/* eslint-disable react/no-string-refs */
import React from "react";
import { t } from "ttag";
import cx from "classnames";

import DashboardSharingEmbeddingModal from "../containers/DashboardSharingEmbeddingModal.jsx";
import FullscreenIcon from "metabase/components/icons/FullscreenIcon";
import Icon from "metabase/components/Icon";
import MetabaseSettings from "metabase/lib/settings";
import NightModeIcon from "metabase/components/icons/NightModeIcon";
import RefreshWidget from "metabase/dashboard/components/RefreshWidget";
import Tooltip from "metabase/components/Tooltip";

import { DashboardHeaderButton } from "metabase/dashboard/containers/DashboardHeader.styled";

export const getDashboardActions = (
  self,
  {
    dashboard,
    isAdmin,
    canManageSubscriptions,
    isEditing = false,
    isEmpty = false,
    isFullscreen,
    isNightMode,
    isPublic = false,
    onNightModeChange,
    onFullscreenChange,
    refreshPeriod,
    setRefreshElapsedHook,
    onRefreshPeriodChange,
    onSharingClick,
  },
) => {
  const isPublicLinksEnabled = MetabaseSettings.get("enable-public-sharing");
  const isEmbeddingEnabled = MetabaseSettings.get("enable-embedding");

  const buttons = [];

  const isLoaded = !!dashboard;
  const hasCards = isLoaded && dashboard.ordered_cards.length > 0;

  // dashcardData only contains question cards, text ones don't appear here
  const hasDataCards =
    hasCards &&
    dashboard.ordered_cards.some(dashCard => dashCard.card.display !== "text");

  const canShareDashboard = hasCards;
  const canCreateSubscription = hasDataCards && canManageSubscriptions;

  if (!isEditing && !isEmpty && !isPublic) {
    // Getting notifications with static text-only cards doesn't make a lot of sense
    if (canCreateSubscription && !isFullscreen) {
      buttons.push(
        <Tooltip tooltip={t`Subscriptions`} key="dashboard-subscriptions">
          <span>
            <DashboardHeaderButton
              disabled={!canManageSubscriptions}
              onClick={onSharingClick}
              data-metabase-event={"Dashboard;Subscriptions"}
            >
              <Icon size={18} name="subscription" />
            </DashboardHeaderButton>
          </span>
        </Tooltip>,
      );
    }

    if (canShareDashboard) {
      buttons.push(
        <DashboardSharingEmbeddingModal
          key="dashboard-embed"
          additionalClickActions={() => self.refs.popover.close()}
          dashboard={dashboard}
          enabled={
            !isEditing &&
            !isFullscreen &&
            ((isPublicLinksEnabled && (isAdmin || dashboard.public_uuid)) ||
              (isEmbeddingEnabled && isAdmin))
          }
          isLinkEnabled={canShareDashboard}
          linkText={
            <Tooltip
              isLinkEnabled={canShareDashboard}
              tooltip={
                canShareDashboard
                  ? t`Sharing`
                  : t`Add data to share this dashboard`
              }
            >
              <DashboardHeaderButton>
                <Icon
                  name="share"
                  className={cx({
                    "text-brand-hover": canShareDashboard,
                    "text-light": !canShareDashboard,
                  })}
                />
              </DashboardHeaderButton>
            </Tooltip>
          }
        />,
      );
    }
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
          <DashboardHeaderButton>
            <NightModeIcon
              className="text-brand-hover cursor-pointer"
              isNightMode={isNightMode}
              onClick={() => onNightModeChange(!isNightMode)}
            />
          </DashboardHeaderButton>
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
          <DashboardHeaderButton
            onClick={e => onFullscreenChange(!isFullscreen, !e.altKey)}
          >
            <FullscreenIcon
              className="text-brand-hover"
              isFullscreen={isFullscreen}
            />
          </DashboardHeaderButton>
        </span>
      </Tooltip>,
    );
  }

  return buttons;
};
