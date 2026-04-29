import { t } from "ttag";

import { EmailChannelEdit } from "metabase/notifications/channels/EmailChannelEdit";
import {
  Anchor,
  Box,
  Card,
  Group,
  Icon,
  Stack,
  Switch,
  Text,
  Title,
} from "metabase/ui";
import { useNotificationConfig } from "metabase-enterprise/security_center/hooks/use-notification-config";

export function EmailChannelCard({ isConfigured }: { isConfigured: boolean }) {
  const { config, updateEmailHandler, toggleSendToAllAdmins, users } =
    useNotificationConfig();

  if (!isConfigured) {
    return (
      <Card withBorder p="lg">
        <Group gap="sm">
          <Icon name="mail" />
          <Title order={4}>{t`Email`}</Title>
        </Group>
        <Text c="text-secondary" mt="sm">
          {t`Email is not configured.`}{" "}
          <Anchor href="/admin/settings/email">{t`Set up email`}</Anchor>
        </Text>
      </Card>
    );
  }

  return (
    <Card withBorder p="lg" data-testid="email-channel-card">
      <Group gap="sm" mb="lg">
        <Icon name="mail" />
        <Title order={4}>{t`Email`}</Title>
      </Group>
      <Stack gap="lg">
        <Switch
          label={t`Send to all instance admins`}
          checked={config.email.sendToAllAdmins}
          onChange={(e) => toggleSendToAllAdmins(e.currentTarget.checked)}
          data-testid="send-to-admins-toggle"
        />
        <Box>
          <Text size="sm" fw={500} mb="xs">
            {config.email.sendToAllAdmins
              ? t`Additional recipients`
              : t`Recipients`}
          </Text>
          <EmailChannelEdit
            channel={config.email.handler}
            users={users}
            autoFocus={false}
            invalidRecipientText={(domains) =>
              t`Only addresses ending in ${domains} are allowed.`
            }
            onChange={updateEmailHandler}
          />
          {!config.email.sendToAllAdmins &&
            config.email.handler.recipients.length === 0 && (
              <Text size="sm" c="error" mt="xs">
                {t`At least one recipient is required.`}
              </Text>
            )}
        </Box>
      </Stack>
    </Card>
  );
}
