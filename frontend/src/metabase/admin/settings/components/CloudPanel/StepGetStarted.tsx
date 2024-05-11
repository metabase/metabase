import { t } from "ttag";

import { useCreateCloudMigrationMutation } from "metabase/api";
import ConfirmContent from "metabase/components/ConfirmContent";
import Modal from "metabase/components/Modal";
import { useToggle } from "metabase/hooks/use-toggle";
import { useDispatch } from "metabase/lib/redux";
import { refreshSiteSettings } from "metabase/redux/settings";
import { Box, Button, Text, List } from "metabase/ui";

// TODO: make the modal look more like the designs
export const StepGetStarted = () => {
  const dispatch = useDispatch();

  const [isModalOpen, { turnOn: openModal, turnOff: closeModal }] =
    useToggle(false);

  const isPro = true; // TODO: determine if instance is pro

  const [createCloudMigration] = useCreateCloudMigrationMutation();

  const handleCreateMigration = async () => {
    await createCloudMigration();
    await dispatch(refreshSiteSettings({}));
  };

  const message = (
    <List size="md">
      <List.Item>{t`Once you start this process, we’ll begin taking a snapshot of this instance, and then uploading it to a new Cloud instance.`}</List.Item>
      <List.Item>{t`You will be directed to Metabase store to create an account and configure the instance details.`}</List.Item>
      <List.Item>{t`During the snapshot step, this instance will be in a read-only mode. This should take 5-10 minutes depending on your instance’s size.`}</List.Item>
    </List>
  ) as unknown as string;

  return (
    <>
      <Box mt="1rem">
        <Text size="md">
          {t`It only takes a few clicks to migrate this instance to Metabase Cloud.`}
          {isPro && " "}
          {isPro ? t`There is no additional cost for your Pro account.` : ""}
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

      {/* TODO: make the action button not red */}
      <Modal isOpen={isModalOpen}>
        <ConfirmContent
          cancelButtonText={t`Cancel`}
          confirmButtonText={t`Migrate now`}
          data-testid="cloud-migration-confirmation"
          title={t`Migrate this instance to Metabase Cloud now?`}
          message={message}
          onAction={handleCreateMigration}
          onCancel={closeModal}
          onClose={closeModal}
        />
      </Modal>
    </>
  );
};
