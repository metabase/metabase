import { t } from "ttag";

import Tooltip from "metabase/core/components/Tooltip";
import { DashboardEmbedAction } from "metabase/dashboard/components/DashboardEmbedAction/DashboardEmbedAction";
import { DashboardHeaderButton } from "metabase/dashboard/components/DashboardHeader/DashboardHeader.styled";

import {
  FullScreenButtonIcon,
  NightModeButtonIcon,
  RefreshWidgetButton,
} from "./DashboardActions.styled";

export const getDashboardActions = props => {
  const {
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
  } = props;
  const buttons = [];

  const isLoaded = !!dashboard;
  const hasCards = isLoaded && dashboard.dashcards.length > 0;

  // dashcardData only contains question cards, text ones don't appear here
  const hasDataCards =
    hasCards &&
    dashboard.dashcards.some(
      dashCard => !["text", "heading"].includes(dashCard.card.display),
    );

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
          />
        </Tooltip>,
      );
    }

    buttons.push(
      <DashboardEmbedAction
        key="dashboard-embed-action"
        dashboard={dashboard}
      />,
    );
  }

  if (!isEditing && !isEmpty) {
    buttons.push(
      <RefreshWidgetButton
        key="refresh"
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
        <span>
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
        <span>
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
