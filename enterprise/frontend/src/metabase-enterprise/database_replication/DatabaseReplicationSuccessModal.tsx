import { t } from "ttag";

import { Box, Button, Flex, Icon, Modal, Stack, Text, Title } from "metabase/ui";
import type { Database } from "metabase-types/api";

export const DatabaseReplicationSuccessModal = ({
  isOpen,
  onClose,
  database,
}: {
  isOpen: boolean;
  onClose: () => void;
  database: Database;
}) => {
  return (
    <Modal
      opened={isOpen}
      onClose={onClose}
      size="md"
      padding="3rem"
      withCloseButton={false}
      centered
    >
      <Stack align="center" spacing="xl">
        <img
          src="/app/assets/img/metabot-cloud-96x96.svg"
          alt="Metabot Cloud"
          style={{
            width: 96,
            height: 96
          }}
        />

        <Stack align="center" spacing="md">
          <Title order={3} style={{ color: "#4A5568", fontWeight: 600 }}>
            {t`Replication in progress`}
          </Title>
          <Text
            size="md"
            style={{
              color: "#718096",
              textAlign: "center",
              lineHeight: 1.5,
              maxWidth: 400
            }}
          >
            {t`The process runs in the background. Depending on the database size, this can take up to several hours. You will get an email once your data is ready to use.`}
          </Text>
        </Stack>

        <Button
          onClick={onClose}
          size="md"
          variant="filled"
          style={{
            minWidth: 120,
            marginTop: "1rem"
          }}
        >
          {t`Done`}
        </Button>
      </Stack>
    </Modal>
  );
};
