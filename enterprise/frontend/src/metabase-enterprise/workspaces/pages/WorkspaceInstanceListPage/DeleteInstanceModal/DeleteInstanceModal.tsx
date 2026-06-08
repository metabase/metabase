import { t } from "ttag";

import {
  Form,
  FormErrorMessage,
  FormProvider,
  FormSubmitButton,
} from "metabase/forms";
import { Button, FocusTrap, Group, Modal, Stack, Text } from "metabase/ui";
import { useDeleteWorkspaceInstanceMutation } from "metabase-enterprise/api";
import type { WorkspaceInstance } from "metabase-types/api";

export type DeleteInstanceModalProps = {
  instance: WorkspaceInstance;
  opened: boolean;
  onDelete: () => void;
  onClose: () => void;
};

export function DeleteInstanceModal({
  instance,
  opened,
  onDelete,
  onClose,
}: DeleteInstanceModalProps) {
  return (
    <Modal
      title={t`Remove ${instance.name}?`}
      opened={opened}
      padding="xl"
      onClose={onClose}
    >
      <FocusTrap.InitialFocus />
      <DeleteInstanceForm
        instance={instance}
        onDelete={onDelete}
        onClose={onClose}
      />
    </Modal>
  );
}

type DeleteInstanceFormProps = {
  instance: WorkspaceInstance;
  onDelete: () => void;
  onClose: () => void;
};

function DeleteInstanceForm({
  instance,
  onDelete,
  onClose,
}: DeleteInstanceFormProps) {
  const [deleteWorkspaceInstance] = useDeleteWorkspaceInstanceMutation();

  const handleSubmit = async () => {
    await deleteWorkspaceInstance(instance.id).unwrap();
    onDelete();
  };

  return (
    <FormProvider initialValues={{}} onSubmit={handleSubmit}>
      <Form>
        <Stack gap="lg">
          <Text>
            {t`This will remove the development instance from this workspace manager. This can't be undone.`}
          </Text>
          <FormErrorMessage />
          <Group justify="flex-end">
            <Button onClick={onClose}>{t`Cancel`}</Button>
            <FormSubmitButton
              label={t`Remove`}
              variant="filled"
              color="danger"
            />
          </Group>
        </Stack>
      </Form>
    </FormProvider>
  );
}
