import { t } from "ttag";

import {
  Form,
  FormErrorMessage,
  FormProvider,
  FormSubmitButton,
} from "metabase/forms";
import { Button, FocusTrap, Modal, Stack, Text } from "metabase/ui";
import { useDeleteWorktreeMutation } from "metabase-enterprise/api";
import type { RemoteSyncWorktree } from "metabase-types/api";

type DeleteWorktreeModalProps = {
  worktree: RemoteSyncWorktree;
  onDelete: () => void;
  onClose: () => void;
};

export function DeleteWorktreeModal({
  worktree,
  onDelete,
  onClose,
}: DeleteWorktreeModalProps) {
  return (
    <Modal
      title={t`Delete the worktree for ${worktree.branch}?`}
      opened
      onClose={onClose}
    >
      <FocusTrap.InitialFocus />
      <DeleteWorktreeForm
        worktree={worktree}
        onDelete={onDelete}
        onClose={onClose}
      />
    </Modal>
  );
}

type DeleteWorktreeFormProps = {
  worktree: RemoteSyncWorktree;
  onDelete: () => void;
  onClose: () => void;
};

function DeleteWorktreeForm({
  worktree,
  onDelete,
  onClose,
}: DeleteWorktreeFormProps) {
  const [deleteWorktree] = useDeleteWorktreeMutation();

  const handleSubmit = async () => {
    await deleteWorktree(worktree.id).unwrap();
    onDelete();
  };

  return (
    <FormProvider initialValues={{}} onSubmit={handleSubmit}>
      <Form>
        <Stack gap="lg">
          <Text>{t`Its changes that aren’t pushed are lost. The branch stays in the repository.`}</Text>
        </Stack>
        <Modal.Footer>
          <FormErrorMessage flex={1} />
          <Button onClick={onClose}>{t`Cancel`}</Button>
          <FormSubmitButton
            label={t`Delete worktree`}
            variant="filled"
            color="negative"
          />
        </Modal.Footer>
      </Form>
    </FormProvider>
  );
}
