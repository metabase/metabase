import { t } from "ttag";

import { SlackChannelFieldNew } from "metabase/notifications/channels/SlackChannelFieldNew";
import {
  Anchor,
  Box,
  Card,
  Flex,
  Group,
  Icon,
  Switch,
  Text,
  Title,
} from "metabase/ui";
import { useNotificationConfig } from "metabase-enterprise/security_center/hooks/use-notification-config";

export function SlackChannelCard({ isConfigured }: { isConfigured: boolean }) {
  const { config, updateSlackHandler, toggleSlack, channels } =
    useNotificationConfig();

  if (!isConfigured) {
    return (
      <Card withBorder p="lg">
        <Group gap="sm">
          <Icon name="slack" />
          <Title order={4}>{t`Slack`}</Title>
        </Group>
        <Text c="text-secondary" mt="sm">
          {t`Slack is not configured.`}{" "}
          <Anchor href="/admin/settings/slack">{t`Set up Slack`}</Anchor>
        </Text>
      </Card>
    );
  }

  return (
    <Card withBorder p="lg" data-testid="slack-channel-card">
      <Flex justify="space-between" align="center" mb="lg">
        <Group gap="sm">
          <Icon name="slack" />
          <Title order={4}>{t`Slack`}</Title>
        </Group>
        <Switch
          checked={config.slack.enabled}
          onChange={(e) => toggleSlack(e.currentTarget.checked)}
          data-testid="slack-toggle"
        />
      </Flex>
      {config.slack.enabled && channels?.slack && (
        <Box>
          <Text size="sm" fw={500} mb="xs">
            {t`Channel`}
          </Text>
          <SlackChannelFieldNew
            channel={config.slack.handler}
            channelSpec={channels.slack}
            onChange={updateSlackHandler}
          />
        </Box>
      )}
    </Card>
  );
}
