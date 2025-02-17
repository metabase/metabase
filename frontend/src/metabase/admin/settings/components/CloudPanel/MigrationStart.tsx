import { t } from "ttag";

import { UpsellCloud } from "metabase/admin/upsells/UpsellCloud";
import ExternalLink from "metabase/core/components/ExternalLink";
import { useToggle } from "metabase/hooks/use-toggle";
import { Box, Button, Icon, Modal, Text } from "metabase/ui";

interface MigrationStartProps {
  startNewMigration: () => void;
  isStarting: boolean;
}

export const MigrationStart = ({
  startNewMigration,
  isStarting,
}: MigrationStartProps) => {
  const [isModalOpen, { turnOn: openModal, turnOff: closeModal }] =
    useToggle(false);

  return (
    <>
      <Box mb="xl">
        <UpsellCloud onOpenModal={openModal} source="settings-cloud" />
      </Box>

      <Modal.Root
        opened={isModalOpen}
        onClose={closeModal}
        size="36rem"
        data-testid="new-cloud-migration-confirmation"
      >
        <Modal.Overlay />
        <Modal.Content pt="1rem" pb="4rem">
          <Modal.Header py="0" px="1rem">
            <Modal.CloseButton />
          </Modal.Header>
          <Modal.Body mt="md" py="0" px="6rem" ta="center">
            <Icon name="cloud_filled" size="3rem" color="brand" />
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
          </Modal.Body>
        </Modal.Content>
      </Modal.Root>
    </>
  );
};
