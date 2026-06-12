import { t } from "ttag";

import {
  Form,
  FormErrorMessage,
  FormProvider,
  FormSubmitButton,
} from "metabase/forms";
import { Button, FocusTrap, Group, Modal, Stack, Text } from "metabase/ui";
import { useDeleteWorkspaceMutation } from "metabase-enterprise/api";
import type { Workspace } from "metabase-types/api";

export type DeleteWorkspaceModalProps = {
  workspace: Workspace;
  opened: boolean;
  onDelete: () => void;
  onClose: () => void;
};

export function DeleteWorkspaceModal({
  workspace,
  opened,
  onDelete,
  onClose,
}: DeleteWorkspaceModalProps) {
  return (
    <Modal
      title={t`Delete this workspace?`}
      opened={opened}
      padding="xl"
      onClose={onClose}
    >
      <FocusTrap.InitialFocus />
      <DeleteWorkspaceForm
        workspace={workspace}
        onDelete={onDelete}
        onClose={onClose}
      />
    </Modal>
  );
}

type DeleteWorkspaceFormProps = {
  workspace: Workspace;
  onDelete: () => void;
  onClose: () => void;
};

function DeleteWorkspaceForm({
  workspace,
  onDelete,
  onClose,
}: DeleteWorkspaceFormProps) {
  const [deleteWorkspace] = useDeleteWorkspaceMutation();

  const handleSubmit = async () => {
    await deleteWorkspace(workspace.id).unwrap();
    onDelete();
  };

  return (
    <FormProvider initialValues={{}} onSubmit={handleSubmit}>
      <Form>
        <Stack gap="lg">
          <Text>
            {t`This will delete the workspace as well as the temporary database users and schemas that were created for this workspace. This can't be undone.`}
          </Text>
          <FormErrorMessage />
          <Group justify="flex-end">
            <Button onClick={onClose}>{t`Cancel`}</Button>
            <FormSubmitButton
              label={t`Delete workspace`}
              variant="filled"
              color="danger"
            />
          </Group>
        </Stack>
      </Form>
    </FormProvider>
  );
}
