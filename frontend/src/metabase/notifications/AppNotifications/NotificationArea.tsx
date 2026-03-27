import { Indicator, Notification } from "@mantine/core";
import { t } from "ttag";

import { Button, Flex, Icon, type IconName, Popover, Stack, Text } from "metabase/ui";
import type { ColorName } from "metabase/ui/colors";
import { IconButton } from "metabase/visualizations/components/settings/ChartSettingIconRadio.styled";

type NotificationContent = {
  title: string;
  body: string;
  color?: ColorName;
  actionButtonLabel?: string;
}

const testData: NotificationContent[] = [
  {
    title: "New version available",
    body: "Metabase v60 is now available. Please update to the latest version to enjoy new features and improvements.",
    color: "brand",
    actionButtonLabel: "Update",
  },
  {
    title: "Security update",
    body: "Metabase v60.1 contains an important security update for Redshift impersonation. Please update as soon as possible.",
    color: "warning",
    actionButtonLabel: "Update",
  },
  {
    title: "Bring your own model to Metabot",
    body: "Visit the admin settings to configure AI assistance on this instance",
    color: "success",
    actionButtonLabel: "Configure",
  },
]


export const NotificationArea = (): JSX.Element => {
  return (
    <Popover position="bottom-end">
      <Popover.Target>
        <Indicator>
          <IconButton
            data-testid="metabase-notifications"
            icon="bell"
          />
        </Indicator>
      </Popover.Target>
      <Popover.Dropdown bg="background-secondary">
        <Stack gap="sm" p="md" mah="60rem">
          {testData.map((notification, index) => (
            <NotificationItem key={index} {...notification} />
          ))}
        </Stack>
        <Button variant="subtle" fullWidth mb="sm">
          {t`Show all`}
        </Button>
      </Popover.Dropdown>
    </Popover>
  );
}

export const NotificationItem = ({ title, body, actionButtonLabel }: NotificationContent) => {
  return (
      <Notification
        title={<Text fw="bold" fz="lg" mt="sm">{title}</Text>}
        maw="20rem"
        m="0"
        color={"none"}
        withBorder
        bd="1px solid var(--mb-color-border)"
        style={{ boxShadow: "none" }}
      >
        <Text lh="md" py="sm">
          {body}
        </Text>
        <Flex gap="sm" justify="flex-end" mb="sm">
          <Button variant="subtle" size="xs" mt="sm">
            {t`Dismiss`}
          </Button>
          <Button variant="light" size="xs" mt="sm">
            {actionButtonLabel}
          </Button>
        </Flex>
      </Notification>
  );
}