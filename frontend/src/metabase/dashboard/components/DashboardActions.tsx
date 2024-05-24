import { t } from "ttag";

import Tooltip from "metabase/core/components/Tooltip";
import { DashboardEmbedAction } from "metabase/dashboard/components/DashboardEmbedAction/DashboardEmbedAction";
import { DashboardHeaderButton } from "metabase/dashboard/components/DashboardHeader/DashboardHeader.styled";
import type { Dashboard, DashboardCard } from "metabase-types/api";

import {
  FullScreenButtonIcon,
  NightModeButtonIcon,
  RefreshWidgetButton,
} from "./DashboardActions.styled";

type GetDashboardActionsProps = {
  canManageSubscriptions?: boolean;
  dashboard: Dashboard | null;
  formInput?: any;
  hasNightModeToggle: boolean;
  isAdmin?: boolean;
  isEditing?: boolean;
  isEmpty?: boolean;
  isFullscreen: boolean;
  isNightMode: boolean;
  isPublic?: boolean;
  onFullscreenChange: (
    isFullscreen: boolean,
    isBrowserFullscreen?: boolean,
  ) => void;
  onNightModeChange: (isNightMode: boolean) => void;
  onRefreshPeriodChange: (period: number | null) => void;
  onSharingClick?: () => void;
  refreshPeriod: number | null;
  setRefreshElapsedHook?: (hook: (elapsed: number) => void) => void;
};

export const getDashboardActions = ({
  canManageSubscriptions = false,
  dashboard,
  formInput,
  hasNightModeToggle,
  isAdmin,
  isEditing = false,
  isEmpty = false,
  isFullscreen,
  isNightMode,
  isPublic = false,
  onFullscreenChange,
  onNightModeChange,
  onRefreshPeriodChange,
  onSharingClick,
  refreshPeriod,
  setRefreshElapsedHook,
}: GetDashboardActionsProps) => {
  const buttons = [];

  const isLoaded = !!dashboard;
  const hasCards = isLoaded && dashboard.dashcards.length > 0;

  // dashcardData only contains question cards, text ones don't appear here
  const hasDataCards =
    hasCards &&
    dashboard.dashcards.some(
      (dashCard: DashboardCard) =>
        !["text", "heading"].includes(dashCard.card.display),
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

    if (isLoaded) {
      buttons.push(
        <DashboardEmbedAction
          key="dashboard-embed-action"
          dashboard={dashboard}
        />,
      );
    }
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
