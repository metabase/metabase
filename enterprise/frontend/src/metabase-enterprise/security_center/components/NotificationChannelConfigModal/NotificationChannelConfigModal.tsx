import { useCallback, useState } from "react";
import { t } from "ttag";

import { useSendTestNotificationMutation } from "metabase/api/security-center";
import { useSetting, useToast } from "metabase/common/hooks";
import { EmailChannelEdit } from "metabase/notifications/channels/EmailChannelEdit";
import { SlackChannelFieldNew } from "metabase/notifications/channels/SlackChannelFieldNew";
import {
  Anchor,
  Box,
  Button,
  Card,
  Flex,
  Group,
  Icon,
  Modal,
  Stack,
  Switch,
  Text,
  Title,
} from "metabase/ui";

import type { useNotificationConfig } from "../../hooks/use-notification-config";

type NotificationChannelConfigModalProps = ReturnType<
  typeof useNotificationConfig
> & {
  opened: boolean;
  onClose: () => void;
  resetConfig: () => void;
};

export function NotificationChannelConfigModal({
  opened,
  onClose,
  config,
  updateEmailHandler,
  toggleSendToAllAdmins,
  updateSlackHandler,
  toggleSlack,
  save,
  resetConfig,
  users,
  channels,
}: NotificationChannelConfigModalProps) {
  const isEmailConfigured = useSetting("email-configured?");
  const isSlackConfigured = useSetting("slack-token-valid?");
  const [sendToast] = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const [sendTestNotification] = useSendTestNotificationMutation();
  const [isSendingTest, setIsSendingTest] = useState(false);

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    try {
      await save();
      sendToast({
        message: t`Notification settings saved`,
        toastColor: "success",
      });
      onClose();
    } catch {
      sendToast({
        icon: "warning",
        toastColor: "error",
        message: t`Failed to save notification settings`,
      });
    } finally {
      setIsSaving(false);
    }
  }, [save, sendToast, onClose]);

  const handleSendTest = useCallback(async () => {
    setIsSendingTest(true);
    try {
      await sendTestNotification().unwrap();
      sendToast({
        message: t`Test notification sent`,
        toastColor: "success",
      });
    } catch {
      sendToast({
        icon: "warning",
        toastColor: "error",
        message: t`Failed to send test notification`,
      });
    } finally {
      setIsSendingTest(false);
    }
  }, [sendTestNotification, sendToast]);

  const emailHasRecipients =
    config.email.sendToAllAdmins || config.email.handler.recipients.length > 0;
  const canSave = emailHasRecipients || !isEmailConfigured;

  return (
    <Modal
      opened={opened}
      onClose={() => {
        resetConfig();
        onClose();
      }}
      title={t`Notification settings`}
      size="lg"
    >
      <Stack gap="md" mt="md">
        <EmailChannelCard
          config={config}
          isConfigured={isEmailConfigured}
          users={users}
          updateEmailHandler={updateEmailHandler}
          toggleSendToAllAdmins={toggleSendToAllAdmins}
        />
        <SlackChannelCard
          config={config}
          isConfigured={isSlackConfigured}
          channels={channels}
          updateSlackHandler={updateSlackHandler}
          toggleSlack={toggleSlack}
        />
        <Flex justify="space-between" mt="md">
          <Button
            variant="subtle"
            leftSection={<Icon name="mail" />}
            onClick={handleSendTest}
            loading={isSendingTest}
          >
            {t`Send test notification`}
          </Button>
          <Group gap="md">
            <Button
              variant="subtle"
              onClick={() => {
                resetConfig();
                onClose();
              }}
            >
              {t`Cancel`}
            </Button>
            <Button
              variant="filled"
              onClick={handleSave}
              loading={isSaving}
              disabled={!canSave}
            >
              {t`Save`}
            </Button>
          </Group>
        </Flex>
      </Stack>
    </Modal>
  );
}

function EmailChannelCard({
  config,
  isConfigured,
  users,
  updateEmailHandler,
  toggleSendToAllAdmins,
}: {
  config: NotificationChannelConfigModalProps["config"];
  isConfigured: boolean;
  users: NotificationChannelConfigModalProps["users"];
  updateEmailHandler: NotificationChannelConfigModalProps["updateEmailHandler"];
  toggleSendToAllAdmins: NotificationChannelConfigModalProps["toggleSendToAllAdmins"];
}) {
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
      <Group gap="sm" mb="md">
        <Icon name="mail" />
        <Title order={4}>{t`Email`}</Title>
      </Group>
      <Stack gap="md">
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

function SlackChannelCard({
  config,
  isConfigured,
  channels,
  updateSlackHandler,
  toggleSlack,
}: {
  config: NotificationChannelConfigModalProps["config"];
  isConfigured: boolean;
  channels: NotificationChannelConfigModalProps["channels"];
  updateSlackHandler: NotificationChannelConfigModalProps["updateSlackHandler"];
  toggleSlack: NotificationChannelConfigModalProps["toggleSlack"];
}) {
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
      <Flex justify="space-between" align="center" mb="md">
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
