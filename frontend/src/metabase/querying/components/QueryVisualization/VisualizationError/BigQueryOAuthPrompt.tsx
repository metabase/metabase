import { useState } from "react";
import { t } from "ttag";

import { useLazyGetBigQueryOAuthAuthorizeUrlQuery } from "metabase/api/google-bigquery";
import { Box, Button, Center, Icon, Modal, Stack, Text } from "metabase/ui";

interface BigQueryOAuthPromptProps {
  className?: string;
}

export function BigQueryOAuthPrompt({ className }: BigQueryOAuthPromptProps) {
  const [modalOpen, setModalOpen] = useState(true);
  const [getAuthorizeUrl, { isLoading }] =
    useLazyGetBigQueryOAuthAuthorizeUrlQuery();

  const handleConnect = async () => {
    const result = await getAuthorizeUrl();
    if (result.data?.url) {
      window.location.href = result.data.url;
    }
  };

  return (
    <>
      <Modal
        opened={modalOpen}
        onClose={() => setModalOpen(false)}
        title={t`Connect your Google Account`}
        size={480}
      >
        <Stack gap="md">
          <Text>{t`This content requires access to BigQuery. Connect your Google account so your queries run as you, with your own permissions and audit trail.`}</Text>
          <Button
            variant="filled"
            loading={isLoading}
            onClick={handleConnect}
            leftSection={<Icon name="google" />}
          >
            {t`Connect Google Account`}
          </Button>
          <Button variant="subtle" onClick={() => setModalOpen(false)}>
            {t`Cancel`}
          </Button>
        </Stack>
      </Modal>

      {/* Placeholder behind the modal so layout doesn't jump */}
      <Center className={className}>
        <Box p="xl" style={{ opacity: 0.4 }}>
          <Icon name="google" size={32} />
        </Box>
      </Center>
    </>
  );
}
