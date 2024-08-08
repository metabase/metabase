import { t } from "ttag";

import Tooltip from "metabase/core/components/Tooltip";
import { setSharing } from "metabase/dashboard/actions";
import { DashboardHeaderButton } from "metabase/dashboard/components/DashboardHeader/DashboardHeader.styled";
import { getIsSharing } from "metabase/dashboard/selectors";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { canManageSubscriptions as canManageSubscriptionsSelector } from "metabase/selectors/user";
import type { Dashboard, DashboardCard } from "metabase-types/api";

export const DashboardSubscriptionButton = () => {
  const dispatch = useDispatch();
  const isSubscriptionsEnabled = useSelector(canManageSubscriptionsSelector);
  const isSharing = useSelector(getIsSharing);
  const toggleSharing = () => {
    dispatch(setSharing(!isSharing));
  };
  return (
    <Tooltip tooltip={t`Subscriptions`} key="dashboard-subscriptions">
      <DashboardHeaderButton
        icon="subscription"
        disabled={!isSubscriptionsEnabled}
        onClick={toggleSharing}
        aria-label="subscriptions"
      />
    </Tooltip>
  );
};

export function shouldRenderSubscriptionButton({
  dashboard,
  canManageSubscriptions,
  formInput,
  isAdmin,
  isEditing,
  isFullscreen,
}: {
  dashboard: Dashboard;
  canManageSubscriptions: boolean;
  formInput: any;
  isAdmin: boolean;
  isEditing: boolean;
  isFullscreen: boolean;
}) {
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

  return (
    !isEditing &&
    !dashboard?.archived &&
    shouldShowSubscriptionsButton &&
    canCreateSubscription &&
    !isFullscreen
  );
}
