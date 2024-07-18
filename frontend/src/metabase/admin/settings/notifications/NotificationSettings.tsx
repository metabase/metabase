import { useState } from "react";
import { Link } from "react-router";
import { t } from "ttag";

import { Alert, Box, Flex, Icon, Modal, Paper, Text, Title } from "metabase/ui";

import { CreateWebhookForm, type WebhookFormProps } from "./CreateWebhookForm";

export const NotificationSettings = () => {
  const [webhookModalOpen, setWebhookModalOpen] = useState(true);

  const handleSumbit = (_vals: WebhookFormProps) => {
    setWebhookModalOpen(false);
  };

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

        <Title mb="1.5rem">{t`Alerts webhook`}</Title>
        <Paper
          shadow="0"
          withBorder
          p="lg"
          w="47rem"
          onClick={() => setWebhookModalOpen(true)}
        >
          <Flex gap="0.5rem" align="center" mb="0.5rem">
            <Icon name="slack" />
            <Title order={2}>{t`Add a webook`}</Title>
          </Flex>
          <Text>{t`Specify a webhook URL where you can send the content of Alerts`}</Text>
        </Paper>
      </Box>

      <Modal.Root
        opened={webhookModalOpen}
        onClose={() => setWebhookModalOpen(false)}
        size="36rem"
      >
        <Modal.Overlay />
        <Modal.Content p="1rem">
          <Modal.Header mb="1.5rem">
            <Modal.Title>{t`New alert webhook`}</Modal.Title>
            <Modal.CloseButton />
          </Modal.Header>
          <Modal.Body>
            <Alert
              variant="light"
              mb="1.5rem"
              style={{ backgroundColor: "var(--mb-color-bg-light)" }}
              px="1.5rem"
              py="1rem"
              radius="0.5rem"
            >
              <Text>{t`You can send the payload of any Alert to this destination whenever the Alert is triggered. Learn about Alerts`}</Text>
            </Alert>
            <CreateWebhookForm
              onSubmit={handleSumbit}
              onCancel={() => setWebhookModalOpen(false)}
            />
          </Modal.Body>
        </Modal.Content>
      </Modal.Root>
    </>
  );
};
