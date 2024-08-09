import { t } from "ttag";

import { ToolbarButton } from "metabase/components/ToolbarButton";
import { setSharing } from "metabase/dashboard/actions";
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
    <ToolbarButton
      tooltipLabel={t`Subscriptions`}
      icon="subscription"
      disabled={!isSubscriptionsEnabled}
      onClick={toggleSharing}
      aria-label="subscriptions"
    />
  );
};

type ShouldRenderSubscriptionButtonProps = {
  dashboard: Dashboard;
  canManageSubscriptions: boolean;
  formInput: any;
  isAdmin: boolean;
  isEditing: boolean;
  isFullscreen: boolean;
};

export function shouldRenderSubscriptionButton({
  dashboard,
  canManageSubscriptions,
  formInput,
  isAdmin,
  isEditing,
  isFullscreen,
}: ShouldRenderSubscriptionButtonProps) {
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
