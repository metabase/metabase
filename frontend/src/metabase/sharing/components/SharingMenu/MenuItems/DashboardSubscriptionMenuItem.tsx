import { t } from "ttag";

import { useSetting } from "metabase/common/hooks";
import { useSelector } from "metabase/lib/redux";
import {
  canManageSubscriptions as canManageSubscriptionsSelector,
  getUserIsAdmin,
} from "metabase/selectors/user";
import { Menu, Center, Icon, Title } from "metabase/ui";

export function DashboardSubscriptionMenuItem({
  onClick,
}: {
  onClick: () => void;
}) {
  const isAdmin = useSelector(getUserIsAdmin);
  const isEmailSetup = useSetting("email-configured?");
  const isSlackSetup = useSetting("slack-token-valid?");
  const canManageSubscriptions = useSelector(canManageSubscriptionsSelector);

  const showSubscriptions =
    (isAdmin || isEmailSetup || isSlackSetup) && canManageSubscriptions;

  if (!showSubscriptions) {
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
