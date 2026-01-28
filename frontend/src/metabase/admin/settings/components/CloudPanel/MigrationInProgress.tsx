/* eslint-disable ttag/no-module-declaration -- see metabase#55045 */
import { t } from "ttag";

import { useCancelCloudMigrationMutation } from "metabase/api";
import { ExternalLink } from "metabase/common/components/ExternalLink";
import { useSetting } from "metabase/common/hooks";
import { useToggle } from "metabase/common/hooks/use-toggle";
import type { Plan } from "metabase/common/utils/plan";
import { useDispatch } from "metabase/lib/redux";
import { addUndo } from "metabase/redux/undo";
import {
  Box,
  Button,
  Flex,
  Icon,
  List,
  Modal,
  Progress,
  Text,
} from "metabase/ui";

import { MigrationCard } from "./CloudPanel.styled";
import type { InProgressCloudMigration, InProgressStates } from "./utils";
import { getMigrationUrl } from "./utils";

interface MigrationInProgressProps {
  storeUrl: string;
  plan: Plan;
  migration: InProgressCloudMigration;
}

const progressMessage: Record<InProgressStates, string> = {
  init: t`Talking to Metabase Cloud...`,
  setup: t`Talking to Metabase Cloud...`,
  dump: t`Taking a snapshot of this instance...`,
  upload: t`Uploading the snapshot to the cloud...`,
};

export const MigrationInProgress = ({
  storeUrl,
  plan,
  migration,
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
        icon: "info",
        message: t`Migration to Metabase Cloud has been canceled.`,
        undo: false,
      }),
    );
  };

  const migrationUrl = getMigrationUrl(storeUrl, plan, migration);

  return (
    <>
      <MigrationCard>
        <Flex gap="1.5rem" align="start">
          <Flex
            bg="brand-light"
            h="64px"
            style={{ borderRadius: "50%", flex: "0 0 64px" }}
            justify="center"
            align="center"
          >
            <Icon name="cloud_filled" size="2.375rem" c="brand" />
          </Flex>
          <Box style={{ flex: "1 0 0" }}>
            <Text fw="bold">{t`Migrating to Metabase Cloud…`}</Text>
            {readOnly ? (
              <List size="md" mt="md">
                <List.Item>{t`To complete the migration, set up your account in the Metabase Store`}</List.Item>
                <List.Item>{t`While we snapshot your Metabase data, people will be able to view questions and dashboards, but they won't be able to edit or create anything new. It should only take up to 30 minutes`}</List.Item>
              </List>
            ) : (
              <Text mt="md">{t`To complete the migration, set up your account in the Metabase Store`}</Text>
            )}

            <Box mt="lg" mb="md">
              <Text size="md" c="text-secondary">
                {progressMessage[migration.state]}
              </Text>
              <Progress value={migration.progress} mt=".25rem" />
            </Box>

            <Flex justify="space-between">
              <Button
                mt="md"
                onClick={openModal}
                c="error"
              >{t`Cancel migration`}</Button>
              <Button
                mt="md"
                component={ExternalLink}
                href={migrationUrl}
                variant="filled"
              >{t`Go to Metabase Store`}</Button>
            </Flex>
          </Box>
        </Flex>
      </MigrationCard>

      <Modal
        opened={isModalOpen}
        onClose={closeModal}
        size="lg"
        data-testid="cancel-cloud-migration-confirmation"
        title={t`Cancel migration?`}
        padding="2rem"
      >
        <Text mt="md">{t`We will cancel the migration process. After that, this instance will no longer be read-only.`}</Text>
        <Flex justify="end" mt="3.5rem">
          <Button
            variant="filled"
            color="error"
            onClick={handleCancelMigration}
          >{t`Cancel migration`}</Button>
        </Flex>
      </Modal>
    </>
  );
};
