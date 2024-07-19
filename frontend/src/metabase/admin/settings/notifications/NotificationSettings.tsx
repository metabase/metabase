import { useState } from "react";
import { Link } from "react-router";
import { t } from "ttag";

import { useListChannelsQuery } from "metabase/api/channel";
import {
  Box,
  Button,
  Flex,
  Icon,
  type IconName,
  Paper,
  Stack,
  Text,
  Title,
} from "metabase/ui";
import type { NotificationChannel } from "metabase-types/api";

import { CreateWebhookModal } from "./CreateWebhookModal";
import { EditWebhookModal } from "./EditWebhookModal";

type NotificationModals = null | "create" | "edit";

export const NotificationSettings = () => {
  const [webhookModal, setWebhookModal] = useState<NotificationModals>(null);
  const [currentChannel, setCurrentChannel] = useState<NotificationChannel>();

  const { data: channels } = useListChannelsQuery();

  return (
    <>
      <Box>
        <Title mb="1.5rem">{t`Slack`}</Title>
        <Link to="/admin/settings/notifications/slack">
          <Paper shadow="0" withBorder p="lg" w="47rem" mb="2.5rem">
            <Flex gap="0.5rem" align="center" mb="0.5rem">
              <Icon name="slack_colorized" />
              <Title order={2}>{t`Connect to slack`}</Title>
            </Flex>
            <Text>
              {t`If your team uses slack, you can send dashboard subscriptions and
            alerts there`}
            </Text>
          </Paper>
        </Link>

        <Flex justify="space-between" align="center" mb="1.5rem">
          <Title>{t`Alerts webhook`}</Title>{" "}
          {channels?.length !== 0 && (
            <Button
              variant="subtle"
              compact
              leftIcon={<Icon name="add" />}
              onClick={() => setWebhookModal("create")}
            >{t`Add another`}</Button>
          )}
        </Flex>
        {channels?.length === 0 ? (
          <ChannelBox
            title={t`Add a webook`}
            description={t`Specify a webhook URL where you can send the content of Alerts`}
            onClick={() => setWebhookModal("create")}
            icon="webhook"
          />
        ) : (
          <Stack>
            {channels?.map(c => (
              <ChannelBox
                key={`channel-${c.id}`}
                title={c.name}
                description={c.details.description}
                onClick={() => {
                  setWebhookModal("edit");
                  setCurrentChannel(c);
                }}
                icon="webhook"
              />
            ))}
          </Stack>
        )}
      </Box>
      <NotificationSettingsModals
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
    w="47rem"
    onClick={onClick}
    style={{ cursor: "pointer" }}
  >
    <Flex gap="0.5rem" align="center">
      <Icon name={icon} />
      <Title order={2}>{title}</Title>
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
  return (
    <>
      {modal === "create" && <CreateWebhookModal isOpen onClose={onClose} />}
      {modal === "edit" && channel && (
        <EditWebhookModal isOpen onClose={onClose} channel={channel} />
      )}
    </>
  );
};
