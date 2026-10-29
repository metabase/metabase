import { t } from "ttag";

import { ToolbarButton } from "metabase/common/components/ToolbarButton";
import { toggleSharing } from "metabase/dashboard/actions";
import { useDashboardContext } from "metabase/dashboard/context";
import { useCanManageDashboardSubscriptions } from "metabase/dashboard/hooks";
import { getIsSharing } from "metabase/dashboard/selectors";
import { useDispatch, useSelector } from "metabase/redux";

export const DashboardSubscriptionsButton = () => {
  const { dashboard } = useDashboardContext();
  const dispatch = useDispatch();
  const isSharing = useSelector(getIsSharing);
  const canManageDashboardSubscriptions =
    useCanManageDashboardSubscriptions(dashboard);

  if (!canManageDashboardSubscriptions) {
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
