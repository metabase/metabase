import { t } from "ttag";

import Tooltip from "metabase/core/components/Tooltip";

import { DashboardHeaderButton } from "metabase/dashboard/components/DashboardHeader/DashboardHeader.styled";
import { DashboardEmbedAction } from "metabase/dashboard/components/DashboardEmbedAction/DashboardEmbedAction";
import {
  FullScreenButtonIcon,
  NightModeButtonIcon,
  RefreshWidgetButton,
} from "./DashboardActions.styled";

/**
 * Generates dashboard action buttons based on the provided conditions and states.
 *
 * @param {Object} self - The context `this` refers to, not used in the function body.
 * @param {Object} options - An object containing all parameters and flags for action generation.
 * @param {Object} options.dashboard - The dashboard object to determine loaded state and card content.
 * @param {boolean} [options.isAdmin] - Flag indicating if the user has admin privileges.
 * @param {boolean} [options.canManageSubscriptions] - Flag indicating if the user can manage subscriptions.
 * @param {Object} [options.formInput] - Object containing form input data, used to check if channels are configured.
 * @param {boolean} [options.isEditing=false] - Flag indicating if the dashboard is currently being edited.
 * @param {boolean} [options.isEmpty=false] - Flag indicating if the dashboard is empty.
 * @param {boolean} [options.isFullscreen] - Flag indicating if the dashboard is in fullscreen mode.
 * @param {boolean} [options.isNightMode] - Flag indicating if the dashboard is in night mode.
 * @param {boolean} [options.isPublic=false] - Flag indicating if the dashboard is public.
 * @param {Function} [options.onNightModeChange] - Function to call when night mode is toggled.
 * @param {number} [options.refreshPeriod] - The current refresh period for the dashboard.
 * @param {Function} [options.setRefreshElapsedHook] - Function to set the hook for refresh elapsed time.
 * @param {Function} [options.onRefreshPeriodChange] - Function to call when the refresh period is changed.
 * @param {Function} [options.onSharingClick] - Function to call when the sharing button is clicked.
 * @param {Function} [options.onFullscreenChange] - Function to call when fullscreen mode is toggled.
 * @param {boolean} [options.hasNightModeToggle] - Flag indicating if the night mode toggle is available.
 *
 * @returns {Array<JSX.Element>} An array of JSX elements representing the action buttons for the dashboard.
 *
 */
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
