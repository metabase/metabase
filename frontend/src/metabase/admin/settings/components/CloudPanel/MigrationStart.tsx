import { t } from "ttag";

import { getPlan } from "metabase/common/utils/plan";
import { useToggle } from "metabase/hooks/use-toggle";
import { useSelector } from "metabase/lib/redux";
import { getSetting } from "metabase/selectors/settings";
import { Modal, Box, Button, Text, List, Flex } from "metabase/ui";

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

  const plan = useSelector(state =>
    getPlan(getSetting(state, "token-features")),
  );
  const isProSelfHosted = plan === "pro-self-hosted";

  return (
    <>
      <Box mt="1rem">
        <Text size="md">
          {t`It only takes a few clicks to migrate this instance to Metabase Cloud.`}
          {isProSelfHosted && " "}
          {isProSelfHosted
            ? t`There is no additional cost for your Pro account.`
            : ""}
        </Text>

        <Text size="md" mt="1rem">{t`You will get:`}</Text>

        <List size="md">
          <List.Item>{t`Automatic upgrades`}</List.Item>
          <List.Item>{t`Freedom from having to manage your own server`}</List.Item>
          <List.Item>{t`A preconfigured SMTP server`}</List.Item>
        </List>

        <Button
          mt="2rem"
          variant="filled"
          onClick={openModal}
        >{t`Get started`}</Button>
      </Box>

      <Modal.Root
        opened={isModalOpen}
        onClose={closeModal}
        size="lg"
        data-testid="new-cloud-migration-confirmation"
      >
        <Modal.Overlay />
        <Modal.Content p="1rem">
          <Modal.Header pt="1rem" px="1rem">
            <Modal.Title>{t`Migrate this instance to Metabase Cloud now?`}</Modal.Title>
            <Modal.CloseButton />
          </Modal.Header>
          <Modal.Body mt="md" p="0">
            <List spacing="md" mb="3.5rem" mx="1rem">
              <List.Item>{t`Once you start this process, we’ll take a snapshot of this instance, then upload it to a new Cloud instance.`}</List.Item>
              <List.Item>{t`You will be directed to Metabase Store to create an account and configure the instance details.`}</List.Item>
              <List.Item>{t`During the snapshot step, this instance will be in a read-only mode. This should take 5-30 minutes depending on your instance’s size.`}</List.Item>
            </List>
            <Flex justify="end">
              <Button
                variant="filled"
                disabled={isStarting}
                onClick={startNewMigration}
              >{t`Migrate now`}</Button>
            </Flex>
          </Modal.Body>
        </Modal.Content>
      </Modal.Root>
    </>
  );
};
