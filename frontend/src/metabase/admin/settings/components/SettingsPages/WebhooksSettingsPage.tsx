import { useState } from "react";
import { c, t } from "ttag";

import {
  SettingsPageWrapper,
  SettingsSection,
} from "metabase/admin/components/SettingsSection";
import { useListChannelsQuery } from "metabase/api/channel";
import {
  Button,
  Flex,
  Group,
  Icon,
  type IconName,
  Paper,
  Stack,
  Text,
  Title,
} from "metabase/ui";
import type { NotificationChannel } from "metabase-types/api";

import { CreateWebhookModal } from "../widgets/Notifications/CreateWebhookModal";
import { EditWebhookModal } from "../widgets/Notifications/EditWebhookModal";

type WebhookModals = null | "create" | "edit";

export const WebhooksSettingsPage = () => {
  const [webhookModal, setWebhookModal] = useState<WebhookModals>(null);
  const [currentChannel, setCurrentChannel] = useState<NotificationChannel>();

  const { data: channels } = useListChannelsQuery();

  const hasChannels = channels && channels.length > 0;

  return (
    <>
      <SettingsPageWrapper title={t`Webhooks`}>
        <SettingsSection>
          <Group justify="space-between" align="center">
            <Text c="text-secondary">
              {t`Configure webhooks to send alert results to a destination of your choice.`}
            </Text>
            {hasChannels && (
              <Button
                variant="filled"
                size="md"
                leftSection={<Icon name="add" />}
                onClick={() => setWebhookModal("create")}
              >{c("Short for 'Add another webhook'").t`Add another`}</Button>
            )}
          </Group>
          {hasChannels ? (
            <Stack>
              {channels?.map((c) => (
                <ChannelBox
                  key={`channel-${c.id}`}
                  title={c.name}
                  description={c.description}
                  onClick={() => {
                    setWebhookModal("edit");
                    setCurrentChannel(c);
                  }}
                  icon="webhook"
                />
              ))}
            </Stack>
          ) : (
            <ChannelBox
              title={t`Add a webhook`}
              description={t`Specify a webhook URL where you can send the content of Alerts`}
              onClick={() => setWebhookModal("create")}
              icon="webhook"
            />
          )}
        </SettingsSection>
      </SettingsPageWrapper>
      <WebhookSettingsModals
        modal={webhookModal}
        channel={currentChannel}
        onClose={() => setWebhookModal(null)}
      />
    </>
  );
};

const ChannelBox = ({
  title,
  description,
  onClick,
  icon,
}: {
  title: string;
  description?: string;
  onClick: () => void;
  icon: IconName;
}) => (
  <Paper
    shadow="0"
    withBorder
    p="lg"
    onClick={onClick}
    style={{ cursor: "pointer" }}
  >
    <Flex gap="0.5rem" align="center">
      <Icon name={icon} />
      <Title order={3}>{title}</Title>
    </Flex>
    {description && <Text mt="0.5rem">{description}</Text>}
  </Paper>
);

const WebhookSettingsModals = ({
  modal,
  channel,
  onClose,
}: {
  modal: WebhookModals;
  channel?: NotificationChannel;
  onClose: () => void;
}) => {
  if (modal === "create") {
    return <CreateWebhookModal isOpen onClose={onClose} />;
  }
  if (modal === "edit" && channel) {
    return <EditWebhookModal isOpen onClose={onClose} channel={channel} />;
  }
  return null;
};
