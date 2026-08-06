import { t } from "ttag";

import { useGetChannelInfoQuery } from "metabase/api";
import { ToolbarButton } from "metabase/common/components/ToolbarButton";
import { toggleSharing } from "metabase/dashboard/actions";
import { useDashboardContext } from "metabase/dashboard/context";
import { getIsSharing } from "metabase/dashboard/selectors";
import { useDispatch, useSelector } from "metabase/redux";
import {
  canManageSubscriptions as canManageSubscriptionsSelector,
  getUserIsAdmin,
} from "metabase/selectors/user";

export const DashboardSubscriptionsButton = () => {
  const { dashboard } = useDashboardContext();
  const dispatch = useDispatch();

  const isAdmin = useSelector(getUserIsAdmin);
  const canManageSubscriptions = useSelector(canManageSubscriptionsSelector);
  const isSharing = useSelector(getIsSharing);

  // Skip the request entirely when the user can't manage subscriptions so we
  // don't fetch channel info unnecessarily on dashboard load (EMB-967).
  const { data: channelInfo } = useGetChannelInfoQuery(undefined, {
    skip: !canManageSubscriptions,
  });
  const hasEmailSetup = !!channelInfo?.channels?.email?.configured;
  const hasSlackSetup = !!channelInfo?.channels?.slack?.configured;

  // dashcardData only contains question cards, text ones don't appear here
  const hasDataCards = dashboard?.dashcards?.some(
    (dashCard) => !["text", "heading"].includes(dashCard.card.display),
  );

  const hasAnySubscriptionChannel = hasEmailSetup || hasSlackSetup;

  if (!dashboard || !canManageSubscriptions || !hasDataCards) {
    return null;
  }

  // Hide subscriptions from non-admins when the instance has no email or Slack
  // channel configured, since only admins can set those channels up.
  if (!isAdmin && !hasAnySubscriptionChannel) {
    return null;
  }

  return (
    <ToolbarButton
      icon="subscription"
      aria-label={t`Subscriptions`}
      tooltipLabel={t`Subscriptions`}
      isActive={isSharing}
      onClick={() => dispatch(toggleSharing())}
      data-testid="dashboard-subscriptions-button"
    />
  );
};
