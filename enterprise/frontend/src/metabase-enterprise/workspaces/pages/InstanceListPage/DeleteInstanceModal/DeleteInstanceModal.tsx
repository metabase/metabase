import { t } from "ttag";

import {
  Form,
  FormErrorMessage,
  FormProvider,
  FormSubmitButton,
} from "metabase/forms";
import { useSelector } from "metabase/redux";
import { getApplicationName } from "metabase/selectors/whitelabel";
import { Button, FocusTrap, Group, Modal, Stack, Text } from "metabase/ui";
import { useDeleteWorkspaceInstanceMutation } from "metabase-enterprise/api";
import type { WorkspaceInstance } from "metabase-types/api";

export type DeleteInstanceModalProps = {
  instance: WorkspaceInstance;
  opened: boolean;
  onClose: () => void;
};

export function DeleteInstanceModal({
  instance,
  opened,
  onClose,
}: DeleteInstanceModalProps) {
  const [deleteInstance] = useDeleteWorkspaceInstanceMutation();
  const applicationName = useSelector(getApplicationName);

  const handleSubmit = async () => {
    await deleteInstance(instance.id).unwrap();
    onClose();
  };

  return (
    <Modal
      title={t`Disconnect this instance?`}
      opened={opened}
      padding="xl"
      onClose={onClose}
    >
      <FocusTrap.InitialFocus />
      <FormProvider initialValues={{}} onSubmit={handleSubmit}>
        <Form>
          <Stack gap="lg">
            <Text>
              {t`This only removes the connection from this ${applicationName}. The instance itself and everything on it stay untouched.`}
            </Text>
            <FormErrorMessage />
            <Group justify="flex-end">
              <Button onClick={onClose}>{t`Cancel`}</Button>
              <FormSubmitButton
                label={t`Disconnect`}
                variant="filled"
                color="feedback-negative"
              />
            </Group>
          </Stack>
        </Form>
      </FormProvider>
    </Modal>
  );
}
