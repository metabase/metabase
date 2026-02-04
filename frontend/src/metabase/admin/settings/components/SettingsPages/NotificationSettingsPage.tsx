import { useDisclosure } from "@mantine/hooks";
import { useState } from "react";
import { c, t } from "ttag";

import {
  SettingsPageWrapper,
  SettingsSection,
} from "metabase/admin/components/SettingsSection";
import { useListChannelsQuery } from "metabase/api/channel";
import { useSetting } from "metabase/common/hooks";
import {
  Button,
  Flex,
  Icon,
  type IconName,
  Paper,
  Stack,
  Text,
  Title,
  UnstyledButton,
} from "metabase/ui";
import type { NotificationChannel } from "metabase-types/api";

import { SlackSettingsModal } from "../../slack/SlackSettingsModal";
import { SlackSetup } from "../../slack/SlackSetup";
import { SlackStatus } from "../../slack/SlackStatus";
import { CreateWebhookModal } from "../widgets/Notifications/CreateWebhookModal";
import { EditWebhookModal } from "../widgets/Notifications/EditWebhookModal";

type NotificationModals = null | "create" | "edit";

export const NotificationSettingsPage = () => {
  const [showSlackModal, { open: openSlackModal, close: closeSlackModal }] =
    useDisclosure(false);
  const [webhookModal, setWebhookModal] = useState<NotificationModals>(null);
  const [currentChannel, setCurrentChannel] = useState<NotificationChannel>();
  const slackAppToken = useSetting("slack-app-token");
  const slackBotToken = useSetting("slack-token");

  const { data: channels } = useListChannelsQuery();

  const hasChannels = channels && channels.length > 0;

  return (
    <>
      <SettingsPageWrapper title={t`Notifications`}>
        <SettingsSection title={t`Slack`}>
          {slackAppToken || slackBotToken ? (
            <Paper shadow="0" withBorder p="lg">
              <Flex gap="0.5rem" align="center" mb="1rem">
                <Icon name="slack_colorized" />
                <Title order={3}>{t`Slack`}</Title>
              </Flex>
              {slackAppToken ? <SlackStatus /> : <SlackSetup />}
            </Paper>
          ) : (
            <UnstyledButton
              onClick={openSlackModal}
              variant="unstyled"
              w="100%"
            >
              <Paper shadow="0" withBorder p="lg">
                <Flex gap="0.5rem" align="center" mb="0.5rem">
                  <Icon name="slack_colorized" />
                  <Title order={3}>{t`Connect to Slack`}</Title>
                </Flex>
                <Text>
                  {t`If your team uses Slack, you can send dashboard subscriptions and
              alerts there`}
                </Text>
              </Paper>
            </UnstyledButton>
          )}
        </SettingsSection>

        <SettingsSection>
          <Flex justify="space-between" align="center" mb="1.5rem">
            <Title order={2}>{t`Webhooks for alerts`}</Title>{" "}
            {hasChannels && (
              <Button
                variant="subtle"
                size="compact-md"
                leftSection={<Icon name="add" />}
                onClick={() => setWebhookModal("create")}
              >{c("Short for 'Add another webhook'").t`Add another`}</Button>
            )}
          </Flex>
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
      <NotificationSettingsModals
        modal={webhookModal}
        channel={currentChannel}
        onClose={() => setWebhookModal(null)}
      />
      <SlackSettingsModal isOpen={showSlackModal} onClose={closeSlackModal} />
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

const NotificationSettingsModals = ({
  modal,
  channel,
  onClose,
}: {
  modal: NotificationModals;
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
