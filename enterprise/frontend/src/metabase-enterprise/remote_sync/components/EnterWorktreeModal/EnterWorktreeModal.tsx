import { t } from "ttag";

import {
  Form,
  FormErrorMessage,
  FormProvider,
  FormSelect,
  FormSubmitButton,
} from "metabase/forms";
import { Button, Group, Modal, Stack } from "metabase/ui";
import {
  useListWorktreesQuery,
  useUpdateUserWorktreeMutation,
} from "metabase-enterprise/api";

type EnterWorktreeModalProps = {
  opened: boolean;
  onClose: VoidFunction;
};

type EnterWorktreeValues = {
  worktreeId: string;
};

export function EnterWorktreeModal({
  opened,
  onClose,
}: EnterWorktreeModalProps) {
  return (
    <Modal opened={opened} title={t`Enter a worktree`} onClose={onClose}>
      <EnterWorktreeForm onClose={onClose} />
    </Modal>
  );
}

function EnterWorktreeForm({ onClose }: { onClose: VoidFunction }) {
  const { data: worktrees = [] } = useListWorktreesQuery();
  const [updateUserWorktree] = useUpdateUserWorktreeMutation();

  const options = worktrees.map((worktree) => ({
    value: String(worktree.id),
    label: worktree.branch,
  }));

  const handleSubmit = async ({ worktreeId }: EnterWorktreeValues) => {
    await updateUserWorktree({ worktree_id: Number(worktreeId) }).unwrap();
    onClose();
  };

  return (
    <FormProvider
      initialValues={{ worktreeId: options[0]?.value ?? "" }}
      enableReinitialize
      onSubmit={handleSubmit}
    >
      <Form>
        <Stack gap="lg" mt="lg">
          <FormSelect
            name="worktreeId"
            label={t`Branch`}
            data={options}
            nothingFoundMessage={t`No worktrees`}
          />
          <FormErrorMessage />
          <Group gap="sm" justify="end">
            <Button variant="subtle" onClick={onClose}>{t`Cancel`}</Button>
            <FormSubmitButton
              variant="filled"
              label={t`Enter`}
              disabled={options.length === 0}
            />
          </Group>
        </Stack>
      </Form>
    </FormProvider>
  );
}
