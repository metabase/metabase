import { t } from "ttag";

import {
  Form,
  FormErrorMessage,
  FormProvider,
  FormSubmitButton,
} from "metabase/forms";
import { Box, Button, FocusTrap, Group, Modal, Stack, Text } from "metabase/ui";
import { useDeleteWorkspaceMutation } from "metabase-enterprise/api";
import type { Workspace } from "metabase-types/api";

type DeleteWorkspaceModalProps = {
  workspace: Workspace;
  onDelete: () => void;
  onClose: () => void;
};

export function DeleteWorkspaceModal({
  workspace,
  onDelete,
  onClose,
}: DeleteWorkspaceModalProps) {
  return (
    <Modal
      title={t`Delete this workspace?`}
      opened
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
          <Text>{t`This cannot be undone.`}</Text>
          <Group>
            <Box flex={1}>
              <FormErrorMessage />
            </Box>
            <Button onClick={onClose}>{t`Cancel`}</Button>
            <FormSubmitButton
              label={t`Delete workspace`}
              variant="filled"
              color="error"
            />
          </Group>
        </Stack>
      </Form>
    </FormProvider>
  );
}
