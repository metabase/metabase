import { t } from "ttag";

import { useCreateCloudMigrationMutation } from "metabase/api";
import { getPlan } from "metabase/common/utils/plan";
import { useToggle } from "metabase/hooks/use-toggle";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { refreshSiteSettings } from "metabase/redux/settings";
import { getSetting } from "metabase/selectors/settings";
import { Modal, Box, Button, Text, List, Flex } from "metabase/ui";

// TODO: make the modal look more like the designs
export const StepGetStarted = () => {
  const dispatch = useDispatch();

  const [isModalOpen, { turnOn: openModal, turnOff: closeModal }] =
    useToggle(false);

  const plan = useSelector(state =>
    getPlan(getSetting(state, "token-features")),
  );
  const isProSelfHosted = plan === "pro-self-hosted";

  const [createCloudMigration] = useCreateCloudMigrationMutation();

  const handleCreateMigration = async () => {
    await createCloudMigration();
    await dispatch(refreshSiteSettings({}));
  };

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

        <Text size="md">{t`You will get:`}</Text>

        <List size="md">
          <List.Item>{t`Automatic upgrades`}</List.Item>
          <List.Item>{t`Freedom from having to manage your own server`}</List.Item>
          <List.Item>{t`Preconfigured SMTP Server`}</List.Item>
        </List>

        <Button
          mt="1rem"
          variant="filled"
          onClick={openModal}
        >{t`Get started`}</Button>
      </Box>

      <Modal.Root
        opened={isModalOpen}
        onClose={closeModal}
        size="lg"
        data-testid="cloud-migration-confirmation"
      >
        <Modal.Overlay />
        <Modal.Content p="1rem">
          <Modal.Header pt="1rem" px="1rem">
            <Modal.Title>{t`Migrate this instance to Metabase Cloud now?`}</Modal.Title>
            <Modal.CloseButton />
          </Modal.Header>
          <Modal.Body mt="md" p="0">
            <List spacing="md" mb="3.5rem" mx="1rem">
              <List.Item>{t`Once you start this process, we’ll begin taking a snapshot of this instance, and then uploading it to a new Cloud instance.`}</List.Item>
              <List.Item>{t`You will be directed to Metabase store to create an account and configure the instance details.`}</List.Item>
              {/* TODO: dynamic time? https://www.figma.com/file/gDjo1m8C8aEHFtBNvhjp1p?type=design&node-id=86-2764&mode=design#799138756 */}
              <List.Item>{t`During the snapshot step, this instance will be in a read-only mode. This should take 5-10 minutes depending on your instance’s size.`}</List.Item>
            </List>
            <Flex justify="end">
              <Button
                variant="filled"
                onClick={handleCreateMigration}
              >{t`Migrate now`}</Button>
            </Flex>
          </Modal.Body>
        </Modal.Content>
      </Modal.Root>
    </>
  );
};
