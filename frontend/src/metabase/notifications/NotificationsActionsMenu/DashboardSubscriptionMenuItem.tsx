import { t } from "ttag";

import { useHasEmailSetup } from "metabase/common/hooks";
import { useSelector } from "metabase/lib/redux";
import {
  canManageSubscriptions as canManageSubscriptionsSelector,
  getUserIsAdmin,
} from "metabase/selectors/user";
import { Icon, Menu, Text } from "metabase/ui";
import type { Dashboard } from "metabase-types/api";

export function DashboardSubscriptionMenuItem({
  onClick,
  dashboard,
}: {
  onClick: () => void;
  dashboard: Dashboard;
}) {
  const isAdmin = useSelector(getUserIsAdmin);
  const hasEmailSetup = useHasEmailSetup();

  const canManageSubscriptions = useSelector(canManageSubscriptionsSelector);

  // dashcardData only contains question cards, text ones don't appear here
  const hasDataCards = dashboard?.dashcards?.some(
    (dashCard) => !["text", "heading"].includes(dashCard.card.display),
  );

  if (!canManageSubscriptions || !hasDataCards) {
    return null;
  }

  if (!isAdmin && !hasEmailSetup) {
    return (
      <Menu.Item
        data-testid="dashboard-subscription-menu-item"
        leftSection={<Icon name="subscription" />}
        disabled
      >
        <Text size="md" c="inherit">{t`Can't send subscriptions`}</Text>
        <Text size="sm" c="inherit">{t`Ask your admin to set up email`}</Text>
      </Menu.Item>
    );
  }

  return (
    <Menu.Item
      data-testid="dashboard-subscription-menu-item"
      leftSection={<Icon name="subscription" />}
      onClick={onClick}
    >
      {t`Subscriptions`}
    </Menu.Item>
  );
}
