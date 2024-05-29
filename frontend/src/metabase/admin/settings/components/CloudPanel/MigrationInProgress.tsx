import { c, t } from "ttag";

import { useCancelCloudMigrationMutation } from "metabase/api";
import { useSetting } from "metabase/common/hooks";
import ExternalLink from "metabase/core/components/ExternalLink";
import { useToggle } from "metabase/hooks/use-toggle";
import { useDispatch } from "metabase/lib/redux";
import { addUndo } from "metabase/redux/undo";
import { Flex, Text, List, Button, Box, Modal, Progress } from "metabase/ui";

import { MigrationCard } from "./CloudPanel.styled";
import type { InProgressCloudMigration, InProgressStates } from "./utils";

interface MigrationInProgressProps {
  migration: InProgressCloudMigration;
  checkoutUrl: string;
}

const progressMessage: Record<InProgressStates, string> = {
  init: t`Talking to Metabase Cloud...`,
  setup: t`Talking to Metabase Cloud...`,
  dump: t`Taking a snapshot of this instance...`,
  upload: t`Uploading the snapshot to the cloud...`,
};

export const MigrationInProgress = ({
  migration,
  checkoutUrl,
}: MigrationInProgressProps) => {
  const dispatch = useDispatch();

  const readOnly = useSetting("read-only-mode");

  const [isModalOpen, { turnOn: openModal, turnOff: closeModal }] =
    useToggle(false);

  const [cancelCloudMigration] = useCancelCloudMigrationMutation();

  const handleCancelMigration = async () => {
    closeModal();
    await cancelCloudMigration();
    dispatch(
      addUndo({
        icon: "info_filled",
        message: t`Migration to Metabase Cloud has been canceled.`,
        undo: false,
      }),
    );
  };

  return (
    <>
      <MigrationCard>
        <Flex gap="sm" align="center">
          <Text fw="bold">{t`You are now migrating to Metabase Cloud`}</Text>
        </Flex>
        <List size="md" mt="md">
          {readOnly ? (
            <List.Item>{t`This instance will be in read-only mode when taking a snapshot. It could take up to 30 minutes.`}</List.Item>
          ) : (
            <List.Item>{t`This instance is no longer read-only.`}</List.Item>
          )}
          <List.Item>{c(`{0} is a link titled "Metabase Store"`)
            .jt`In the meantime, you can go to the ${(
            <ExternalLink
              href={checkoutUrl}
              key="link"
            >{t`Metabase Store`}</ExternalLink>
          )} to finish account creation and configuring your new Cloud instance.`}</List.Item>
        </List>

        <Box mt="lg" mb="md">
          <Text size="md" c="text-medium">
            {progressMessage[migration.state]}
          </Text>
          <Progress value={migration.progress} mt=".25rem" />
        </Box>

        <Button
          mt="md"
          onClick={openModal}
          c="error"
        >{t`Cancel migration`}</Button>
      </MigrationCard>

      <Modal.Root
        opened={isModalOpen}
        onClose={closeModal}
        size="lg"
        data-testid="cancel-cloud-migration-confirmation"
      >
        <Modal.Overlay />
        <Modal.Content p="1rem">
          <Modal.Header pt="1rem" px="1rem">
            <Modal.Title>{t`Cancel migration?`}</Modal.Title>
            <Modal.CloseButton />
          </Modal.Header>
          <Modal.Body mt="md" px="1rem">
            <Text>{t`We will cancel the migration process. After that, this instance will no longer be read-only.`}</Text>
            <Flex justify="end" mt="3.5rem">
              <Button
                variant="filled"
                color="error"
                onClick={handleCancelMigration}
              >{t`Cancel migration`}</Button>
            </Flex>
          </Modal.Body>
        </Modal.Content>
      </Modal.Root>
    </>
  );
};
