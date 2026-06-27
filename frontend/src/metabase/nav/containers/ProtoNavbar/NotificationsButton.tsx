import { t } from "ttag";

import {
  ActionIcon,
  Box,
  FixedSizeIcon,
  Group,
  Popover,
  Stack,
  Text,
  Tooltip,
} from "metabase/ui";
import type { IconName } from "metabase-types/api";

type FakeNotification = {
  icon: IconName;
  iconColor: "brand" | "error" | "success";
  title: string;
  body: string;
  time: string;
};

function getFakeNotifications(): FakeNotification[] {
  return [
    {
      icon: "document",
      iconColor: "brand",
      title: t`New comment`,
      body: t`Dana commented on your document “Q3 Planning”`,
      time: t`2m ago`,
    },
    {
      icon: "document",
      iconColor: "brand",
      title: t`You were mentioned`,
      body: t`Miguel mentioned you in “Revenue Review”`,
      time: t`25m ago`,
    },
    {
      icon: "warning",
      iconColor: "error",
      title: t`Transform failed`,
      body: t`Your transform “Daily orders rollup” failed to run`,
      time: t`1h ago`,
    },
    {
      icon: "check_filled",
      iconColor: "success",
      title: t`Goal reached`,
      body: t`“Weekly active users” hit its goal of 10,000`,
      time: t`3h ago`,
    },
  ];
}

export function NotificationsButton() {
  const notifications = getFakeNotifications();

  return (
    <Popover position="top-start" shadow="md" withinPortal>
      <Popover.Target>
        <Tooltip label={t`Notifications`}>
          <ActionIcon aria-label={t`Notifications`} c="text-secondary">
            <FixedSizeIcon name="bell" />
          </ActionIcon>
        </Tooltip>
      </Popover.Target>
      <Popover.Dropdown>
        <Box w="20rem" p="xs">
          <Text fw={700} px="sm" pb="xs">
            {t`Notifications`}
          </Text>
          <Stack gap={0}>
            {notifications.map((notification, index) => (
              <Group
                key={index}
                gap="sm"
                wrap="nowrap"
                align="flex-start"
                p="sm"
                style={{ borderRadius: "0.5rem" }}
              >
                <FixedSizeIcon
                  name={notification.icon}
                  c={notification.iconColor}
                  style={{ marginTop: "0.125rem" }}
                />
                <Box miw={0} style={{ flex: 1 }}>
                  <Group justify="space-between" wrap="nowrap" gap="sm">
                    <Text fw={600} fz="sm" truncate>
                      {notification.title}
                    </Text>
                    <Text fz="xs" c="text-secondary" style={{ flexShrink: 0 }}>
                      {notification.time}
                    </Text>
                  </Group>
                  <Text fz="sm" c="text-secondary">
                    {notification.body}
                  </Text>
                </Box>
              </Group>
            ))}
          </Stack>
        </Box>
      </Popover.Dropdown>
    </Popover>
  );
}
