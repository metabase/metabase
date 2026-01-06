import { t } from "ttag";

import type { DashboardSubscriptionsButtonProps } from "embedding-sdk-bundle/components/public/notifications";
import { ToolbarButton } from "metabase/common/components/ToolbarButton";
import { useHasEmailSetup } from "metabase/common/hooks";
import { toggleSharing } from "metabase/dashboard/actions";
import { useDashboardContext } from "metabase/dashboard/context";
import { useDispatch } from "metabase/lib/redux";

/**
 * @internal Do not import this component directly, use either SDK or EAJS EE plugins instead.
 */
export const DashboardSubscriptionsButton = (
  props: DashboardSubscriptionsButtonProps,
) => {
  const dispatch = useDispatch();
  const handleClick = () => dispatch(toggleSharing());

  const { dashboard } = useDashboardContext();

  /**
   * Use the same logic as in the core app
   * @see {@link https://github.com/metabase/metabase/blob/71ed90d16cb7c64946135d404c1a79ef65995f03/frontend/src/metabase/notifications/NotificationsActionsMenu/DashboardSubscriptionMenuItem.tsx#L26-L28}
   */
  const hasDataCards = dashboard?.dashcards?.some(
    (dashCard) => !["text", "heading"].includes(dashCard.card.display),
  );
  // We decided not to show the subscriptions button if email is not set up
  const hasEmailSetup = useHasEmailSetup();
  if (!hasEmailSetup || !hasDataCards) {
    return null;
  }

  return (
    <ToolbarButton
      icon="subscription"
      tooltipLabel={t`Subscriptions`}
      onClick={handleClick}
      {...props}
    />
  );
};
