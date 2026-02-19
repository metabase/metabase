import { useDisclosure } from "@mantine/hooks";
import { t } from "ttag";

import { UpsellCloud } from "metabase/admin/upsells/UpsellCloud";
import { ExternalLink } from "metabase/common/components/ExternalLink";
import { Box, Button, Icon, Modal, Text } from "metabase/ui";

interface MigrationStartProps {
  startNewMigration: () => void;
  isStarting: boolean;
}

export const MigrationStart = ({
  startNewMigration,
  isStarting,
}: MigrationStartProps) => {
  const [isModalOpen, { open: openModal, close: closeModal }] =
    useDisclosure(false);

  return (
    <>
      <Box mb="xl">
        <UpsellCloud onOpenModal={openModal} source="settings-cloud" />
      </Box>

      <Modal
        opened={isModalOpen}
        onClose={closeModal}
        size="36rem"
        data-testid="new-cloud-migration-confirmation"
        styles={{
          body: {
            padding: 0,
          },
        }}
      >
        <Box mt="md" pb="4rem" px="6rem" ta="center">
          <Icon name="cloud_filled" size="3rem" c="brand" />
          <Modal.Title mt="1.5rem">{t`Get started with Metabase Cloud`}</Modal.Title>

          <Text mt="1.5rem">
            {t`Just a heads up: your Metabase will be read-only for up to 30
              minutes while we prep it for migration.`}{" "}
            <ExternalLink href="https://www.metabase.com/cloud/">{t`Learn More.`}</ExternalLink>
          </Text>

          <Button
            variant="filled"
            disabled={isStarting}
            onClick={startNewMigration}
            mt="2rem"
          >{t`Migrate now`}</Button>
        </Box>
      </Modal>
    </>
  );
};
