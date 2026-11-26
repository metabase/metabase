import { t } from "ttag";

import {
  Form,
  FormErrorMessage,
  FormProvider,
  FormSubmitButton,
} from "metabase/forms";
import {
  Alert,
  Button,
  FocusTrap,
  Icon,
  Modal,
  Stack,
  Text,
} from "metabase/ui";
import { useDeleteWorktreeMutation } from "metabase-enterprise/api";
import type { RemoteSyncWorktree } from "metabase-types/api";

type DeleteWorktreeModalProps = {
  worktree: RemoteSyncWorktree;
  isLastWorktree: boolean;
  onDelete: () => void;
  onClose: () => void;
};

export function DeleteWorktreeModal({
  worktree,
  isLastWorktree,
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
        isLastWorktree={isLastWorktree}
        onDelete={onDelete}
        onClose={onClose}
      />
    </Modal>
  );
}

type DeleteWorktreeFormProps = {
  worktree: RemoteSyncWorktree;
  isLastWorktree: boolean;
  onDelete: () => void;
  onClose: () => void;
};

function DeleteWorktreeForm({
  worktree,
  isLastWorktree,
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
          {isLastWorktree && (
            <Alert variant="light" icon={<Icon name="info" />}>
              {t`This is the last worktree, so deleting it turns row-level security off for the application database, which then no longer filters its rows by worktree.`}
            </Alert>
          )}
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
