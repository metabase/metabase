import { t } from "ttag";

import type { DashboardSubscriptionsButtonProps } from "embedding-sdk-bundle/components/public/subscriptions";
import { ToolbarButton } from "metabase/common/components/ToolbarButton";
import { useHasEmailSetup } from "metabase/common/hooks";
import { toggleSharing } from "metabase/dashboard/actions";
import { useDispatch } from "metabase/lib/redux";

/**
 * @internal
 */
export const DashboardSubscriptionsButton = (
  props: DashboardSubscriptionsButtonProps,
) => {
  const dispatch = useDispatch();
  const handleClick = () => dispatch(toggleSharing());

  // We decided not to show the subscriptions button if email is not set up
  const hasEmailSetup = useHasEmailSetup();
  if (!hasEmailSetup) {
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
