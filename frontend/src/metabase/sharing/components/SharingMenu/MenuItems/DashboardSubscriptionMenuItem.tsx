import { t } from "ttag";

import { useHasEmailSetup } from "metabase/common/hooks";
import { useSelector } from "metabase/lib/redux";
import {
  canManageSubscriptions as canManageSubscriptionsSelector,
  getUserIsAdmin,
} from "metabase/selectors/user";
import { Menu, Center, Icon, Title, Stack, Text } from "metabase/ui";

export function DashboardSubscriptionMenuItem({
  onClick,
}: {
  onClick: () => void;
}) {
  const isAdmin = useSelector(getUserIsAdmin);
  const hasEmailSetup = useHasEmailSetup();

  const canManageSubscriptions = useSelector(canManageSubscriptionsSelector);

  if (!canManageSubscriptions) {
    return null;
  }

  if (!isAdmin && !hasEmailSetup) {
    return (
      <Menu.Item
        data-testid="dashboard-subscription-menu-item"
        my="sm"
        icon={
          <Center mr="xs">
            <Icon name="subscription" />
          </Center>
        }
        disabled
      >
        <Stack spacing="xs">
          <Title order={4} color="inherit">{t`Can't send subscriptions`}</Title>
          <Text
            size="sm"
            color="inherit"
          >{t`As your admin to set up email`}</Text>
        </Stack>
      </Menu.Item>
    );
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
