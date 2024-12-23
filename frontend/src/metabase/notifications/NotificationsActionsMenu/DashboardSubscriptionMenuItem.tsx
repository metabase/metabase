import { t } from "ttag";

import { useHasEmailSetup } from "metabase/common/hooks";
import { useSelector } from "metabase/lib/redux";
import { getUserIsAdmin } from "metabase/selectors/user";
import { Icon, Menu, Stack, Text, Title } from "metabase/ui";

export function DashboardSubscriptionMenuItem({
  onClick,
}: {
  onClick: () => void;
}) {
  const isAdmin = useSelector(getUserIsAdmin);
  const hasEmailSetup = useHasEmailSetup();

  if (!isAdmin && !hasEmailSetup) {
    return (
      <Menu.Item
        data-testid="dashboard-subscription-menu-item"
        icon={<Icon name="subscription" />}
        disabled
      >
        <Stack spacing="xs">
          <Title order={4} color="inherit">{t`Can't send subscriptions`}</Title>
          <Text
            size="sm"
            color="inherit"
          >{t`Ask your admin to set up email`}</Text>
        </Stack>
      </Menu.Item>
    );
  }

  return (
    <Menu.Item
      data-testid="dashboard-subscription-menu-item"
      icon={<Icon name="subscription" />}
      onClick={onClick}
    >
      {t`Subscriptions`}
    </Menu.Item>
  );
}
