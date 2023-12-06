import { t } from "ttag";

import MetabaseSettings from "metabase/lib/settings";
import Tooltip from "metabase/core/components/Tooltip";

import { DashboardHeaderButton } from "metabase/dashboard/components/DashboardHeader/DashboardHeader.styled";
import { DashboardSharingEmbeddingModalConnected } from "../containers/DashboardSharingEmbeddingModal.jsx";
import {
  FullScreenButtonIcon,
  NightModeButtonIcon,
  RefreshWidgetButton,
  ShareButton,
} from "./DashboardActions.styled";

export const getDashboardActions = (
  self,
  {
    dashboard,
    isAdmin,
    canManageSubscriptions,
    formInput,
    isEditing = false,
    isEmpty = false,
    isFullscreen,
    isNightMode,
    isPublic = false,
    onNightModeChange,
    refreshPeriod,
    setRefreshElapsedHook,
    onRefreshPeriodChange,
    onSharingClick,
    onFullscreenChange,
    hasNightModeToggle,
  },
) => {
  const isPublicLinksEnabled = MetabaseSettings.get("enable-public-sharing");
  const isEmbeddingEnabled = MetabaseSettings.get("enable-embedding");

  const buttons = [];

  const isLoaded = !!dashboard;
  const hasCards = isLoaded && dashboard.dashcards.length > 0;

  // dashcardData only contains question cards, text ones don't appear here
  const hasDataCards =
    hasCards &&
    dashboard.dashcards.some(
      dashCard => !["text", "heading"].includes(dashCard.card.display),
    );

  const canShareDashboard = hasCards;
  const canCreateSubscription = hasDataCards && canManageSubscriptions;

  const emailConfigured = formInput?.channels?.email?.configured || false;
  const slackConfigured = formInput?.channels?.slack?.configured || false;

  const shouldShowSubscriptionsButton =
    emailConfigured || slackConfigured || isAdmin;

  if (!isEditing && !isEmpty && !isPublic) {
    // Getting notifications with static text-only cards doesn't make a lot of sense
    if (
      shouldShowSubscriptionsButton &&
      canCreateSubscription &&
      !isFullscreen
    ) {
      buttons.push(
        <Tooltip tooltip={t`Subscriptions`} key="dashboard-subscriptions">
          <DashboardHeaderButton
            icon="subscription"
            disabled={!canManageSubscriptions}
            onClick={onSharingClick}
            aria-label="subscriptions"
            data-metabase-event="Dashboard;Subscriptions"
          />
        </Tooltip>,
      );
    }

    if (canShareDashboard) {
      buttons.push(
        <DashboardSharingEmbeddingModalConnected
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
              <ShareButton icon="share" canShareDashboard={canShareDashboard} />
            </Tooltip>
          }
        />,
      );
    }
  }

  if (!isEditing && !isEmpty) {
    buttons.push(
      <RefreshWidgetButton
        key="refresh"
        data-metabase-event="Dashboard;Refresh Menu Open"
        period={refreshPeriod}
        setRefreshElapsedHook={setRefreshElapsedHook}
        onChangePeriod={onRefreshPeriodChange}
      />,
    );
  }

  if (!isEditing && isFullscreen && hasNightModeToggle) {
    buttons.push(
      <Tooltip
        key="night"
        tooltip={isNightMode ? t`Daytime mode` : t`Nighttime mode`}
      >
        <span data-metabase-event={"Dashboard;Night Mode;" + !isNightMode}>
          <DashboardHeaderButton
            icon={
              <NightModeButtonIcon
                isNightMode={isNightMode}
                onClick={() => onNightModeChange(!isNightMode)}
              />
            }
          />
        </span>
      </Tooltip>,
    );
  }

  if (!isEditing && !isEmpty && (isPublic || isFullscreen)) {
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
            icon={<FullScreenButtonIcon isFullscreen={isFullscreen} />}
            onClick={e => onFullscreenChange(!isFullscreen, !e.altKey)}
          />
        </span>
      </Tooltip>,
    );
  }

  return buttons;
};
