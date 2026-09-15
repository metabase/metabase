import { useCallback, useState } from "react";
import { t } from "ttag";

import { useToast } from "metabase/common/hooks";
import { useIsSmallScreen } from "metabase/common/hooks/use-is-small-screen";
import { useSetting } from "metabase/settings";
import { Button, Flex, Group, Icon, Modal, Stack } from "metabase/ui";

import { useSendTestNotificationMutation } from "../../api";
import {
  serializeNotificationConfig,
  useNotificationConfig,
} from "../../hooks/use-notification-config";

import { EmailChannelCard } from "./EmailChannelCard/EmailChannelCard";
import { SlackChannelCard } from "./SlackChannelCard/SlackChannelCard";

type NotificationChannelConfigModalProps = {
  opened: boolean;
  onClose: () => void;
};

export function NotificationChannelConfigModal({
  opened,
  onClose,
}: NotificationChannelConfigModalProps) {
  const { config, save, resetConfig } = useNotificationConfig();

  const isEmailConfigured = useSetting("email-configured?");
  const isSlackConfigured = useSetting("slack-token-valid?");
  const [sendToast] = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const [sendTestNotification] = useSendTestNotificationMutation();
  const [isSendingTest, setIsSendingTest] = useState(false);
  const isSmallScreen = useIsSmallScreen();

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    try {
      await save();
      sendToast({
        message: t`Notification settings saved`,
        toastColor: "feedback-positive",
      });
      onClose();
    } catch {
      sendToast({
        icon: "warning",
        toastColor: "feedback-negative",
        message: t`Failed to save notification settings`,
      });
    } finally {
      setIsSaving(false);
    }
  }, [save, sendToast, onClose]);

  const handleSendTest = useCallback(async () => {
    setIsSendingTest(true);
    try {
      await sendTestNotification(serializeNotificationConfig(config)).unwrap();
      sendToast({
        message: t`Test notification sent`,
        toastColor: "feedback-positive",
      });
    } catch {
      sendToast({
        icon: "warning",
        toastColor: "feedback-negative",
        message: t`Failed to send test notification`,
      });
    } finally {
      setIsSendingTest(false);
    }
  }, [sendTestNotification, sendToast, config]);

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
      fullScreen={isSmallScreen}
    >
      <Stack gap="lg" mt="lg">
        <EmailChannelCard isConfigured={isEmailConfigured} />
        <SlackChannelCard isConfigured={isSlackConfigured} />
        <Flex justify="space-between" gap="lg" mt="lg">
          <Button
            variant="subtle"
            leftSection={<Icon name="mail" />}
            onClick={handleSendTest}
            loading={isSendingTest}
          >
            {t`Send test notification`}
          </Button>
          <Group gap="lg">
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
