import { useMemo } from "react";
import { t } from "ttag";
import * as Yup from "yup";

import {
  Form,
  FormErrorMessage,
  FormProvider,
  FormSelect,
  FormSubmitButton,
} from "metabase/forms";
import { useDispatch } from "metabase/redux";
import { Button, Group, Modal, Stack } from "metabase/ui";
import * as Errors from "metabase/utils/errors";
import {
  useCreateWorktreeMutation,
  useGetBranchesQuery,
  useListWorktreesQuery,
} from "metabase-enterprise/api";

import { worktreeChanged } from "../../sync-task-slice";

type EnterWorktreeModalProps = {
  opened: boolean;
  onClose: VoidFunction;
};

type EnterWorktreeValues = Yup.InferType<ReturnType<typeof getSchema>>;

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
  const { data: branchesData } = useGetBranchesQuery();
  const { data: worktrees = [] } = useListWorktreesQuery();
  const [createWorktree] = useCreateWorktreeMutation();
  const dispatch = useDispatch();
  const schema = useMemo(getSchema, []);
  const branches = branchesData?.items ?? [];

  const handleSubmit = async ({ branch }: EnterWorktreeValues) => {
    const worktree =
      worktrees.find((worktree) => worktree.branch === branch) ??
      (await createWorktree({ branch }).unwrap());

    dispatch(worktreeChanged(worktree.id));
    onClose();
  };

  return (
    <FormProvider
      initialValues={{ branch: "" }}
      validationSchema={schema}
      onSubmit={handleSubmit}
    >
      <Form>
        <Stack gap="lg" mt="lg">
          <FormSelect
            name="branch"
            label={t`Branch`}
            data={branches}
            placeholder={t`Select a branch`}
            nothingFoundMessage={t`No branches`}
            searchable
          />
          <FormErrorMessage />
          <Group gap="sm" justify="end">
            <Button variant="subtle" onClick={onClose}>{t`Cancel`}</Button>
            <FormSubmitButton
              variant="filled"
              label={t`Enter`}
              disabled={branches.length === 0}
            />
          </Group>
        </Stack>
      </Form>
    </FormProvider>
  );
}

function getSchema() {
  return Yup.object({
    branch: Yup.string().required(Errors.required),
  });
}
