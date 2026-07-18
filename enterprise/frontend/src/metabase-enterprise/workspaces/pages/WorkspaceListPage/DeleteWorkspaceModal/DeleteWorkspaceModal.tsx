import { t } from "ttag";

import {
  Form,
  FormErrorMessage,
  FormProvider,
  FormSubmitButton,
} from "metabase/forms";
import { Button, FocusTrap, Group, Modal, Stack, Text } from "metabase/ui";
import { useDeleteWorkspaceMutation } from "metabase-enterprise/api";
import type { WorkspaceId } from "metabase-types/api";

export type DeleteWorkspaceModalProps = {
  workspaceId: WorkspaceId;
  onDelete: () => void;
  onClose: () => void;
};

export function DeleteWorkspaceModal({
  workspaceId,
  onDelete,
  onClose,
}: DeleteWorkspaceModalProps) {
  const [deleteWorkspace] = useDeleteWorkspaceMutation();

  const handleSubmit = async () => {
    await deleteWorkspace(workspaceId).unwrap();
    onDelete();
  };

  return (
    <Modal
      title={t`Delete this workspace?`}
      opened
      padding="xl"
      onClose={onClose}
    >
      <FocusTrap.InitialFocus />
      <FormProvider initialValues={{}} onSubmit={handleSubmit}>
        <Form>
          <Stack gap="lg">
            <Text>
              {t`This will delete the workspace. This can't be undone.`}
            </Text>
            <FormErrorMessage />
            <Group justify="flex-end">
              <Button onClick={onClose}>{t`Cancel`}</Button>
              <FormSubmitButton
                label={t`Delete workspace`}
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
