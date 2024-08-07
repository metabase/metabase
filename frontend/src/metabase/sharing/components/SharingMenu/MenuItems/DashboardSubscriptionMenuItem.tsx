import { t } from "ttag";

import { useSelector } from "metabase/lib/redux";
import { canManageSubscriptions as canManageSubscriptionsSelector } from "metabase/selectors/user";
import { Menu, Center, Icon, Title } from "metabase/ui";

export function DashboardSubscriptionMenuItem({
  onClick,
}: {
  onClick: () => void;
}) {
  const canManageSubscriptions = useSelector(canManageSubscriptionsSelector);

  if (!canManageSubscriptions) {
    return null;
  }

  return (
    <Menu.Item
      data-testid="dashboard-subscription-menu-item"
      my="sm"
      icon={
        <Center mr="xs">
          <Icon name="subscription" />
        </Center>
      }
      onClick={onClick}
    >
      <Title order={4}>{t`Subscriptions`}</Title>
    </Menu.Item>
  );
}
