import { t } from "ttag";

import { useHasEmailSetup } from "metabase/common/hooks";
import { ToolbarButton } from "metabase/components/ToolbarButton";
import { useSelector } from "metabase/lib/redux";
import { getUserIsAdmin } from "metabase/selectors/user";

export function DashboardSubscriptionMenuItem({
  onClick,
}: {
  onClick: () => void;
}) {
  const isAdmin = useSelector(getUserIsAdmin);
  const hasEmailSetup = useHasEmailSetup();

  if (!isAdmin && !hasEmailSetup) {
    return (
      <ToolbarButton
        icon="subscription"
        data-testid="dashboard-subscription-menu-item"
        tooltipLabel={t`Can't send subscriptions. Ask your admin to set up email`}
        aria-label={t`Can't send subscriptions. Ask your admin to set up email`}
        disabled
      />
    );
  }

  return (
    <ToolbarButton
      icon="subscription"
      data-testid="dashboard-subscription-menu-item"
      tooltipLabel={t`Subscriptions`}
      aria-label={t`Subscriptions`}
      onClick={onClick}
    />
  );
}
