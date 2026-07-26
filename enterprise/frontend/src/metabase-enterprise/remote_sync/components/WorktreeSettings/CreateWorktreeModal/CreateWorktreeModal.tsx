import { useField } from "formik";
import { useMemo, useState } from "react";
import { jt, t } from "ttag";

import { DelayedLoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import { useSetting } from "metabase/common/hooks";
import {
  Form,
  FormErrorMessage,
  FormProvider,
  FormSelect,
  type FormSelectProps,
  FormSubmitButton,
} from "metabase/forms";
import { Button, Group, Modal, SelectItem, Stack, Text } from "metabase/ui";
import {
  useCreateBranchMutation,
  useCreateWorktreeMutation,
  useGetBranchesQuery,
  useListWorktreesQuery,
} from "metabase-enterprise/api";
import type { RemoteSyncWorktree } from "metabase-types/api";

import { getValidationSchema } from "./utils";

type CreateWorktreeModalProps = {
  opened: boolean;
  onClose: () => void;
};

export function CreateWorktreeModal({
  opened,
  onClose,
}: CreateWorktreeModalProps) {
  return (
    <Modal
      size="30rem"
      padding="xl"
      opened={opened}
      onClose={onClose}
      title={t`Create a worktree`}
    >
      <WorktreeFormLoader onClose={onClose} />
    </Modal>
  );
}

type WorktreeFormLoaderProps = {
  onClose: () => void;
};

function WorktreeFormLoader({ onClose }: WorktreeFormLoaderProps) {
  const mainBranch = useSetting("remote-sync-branch");
  const {
    data: branches = { items: [] },
    isLoading: isLoadingBranches,
    error: branchesError,
  } = useGetBranchesQuery();
  const {
    data: worktrees = [],
    isLoading: isLoadingWorktrees,
    error: worktreesError,
  } = useListWorktreesQuery();

  const isLoading = isLoadingBranches || isLoadingWorktrees;
  const error = branchesError ?? worktreesError;

  if (isLoading || error) {
    return <DelayedLoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  return (
    <WorktreeForm
      branches={branches.items}
      worktrees={worktrees}
      mainBranch={mainBranch}
      onClose={onClose}
    />
  );
}

type CreateWorktreeFormValues = {
  branch: string | null;
};

const INITIAL_VALUES: CreateWorktreeFormValues = { branch: null };

type WorktreeFormProps = {
  branches: string[];
  worktrees: RemoteSyncWorktree[];
  mainBranch: string | null | undefined;
  onClose: () => void;
};

function WorktreeForm({
  branches,
  worktrees,
  mainBranch,
  onClose,
}: WorktreeFormProps) {
  const [
    createBranch,
    { isSuccess: isBranchCreated, originalArgs: createdBranchArgs },
  ] = useCreateBranchMutation();
  const [createWorktree] = useCreateWorktreeMutation();

  const validationSchema = useMemo(
    () => getValidationSchema(worktrees, mainBranch),
    [worktrees, mainBranch],
  );

  const handleSubmit = async ({ branch }: CreateWorktreeFormValues) => {
    if (!branch) {
      return;
    }

    const isNewBranch = !branches.includes(branch);
    if (isNewBranch) {
      const isBranchAlreadyCreated =
        isBranchCreated && createdBranchArgs?.name === branch;
      if (!isBranchAlreadyCreated) {
        await createBranch({ name: branch }).unwrap();
      }
    }

    await createWorktree({ branch }).unwrap();
    onClose();
  };

  return (
    <FormProvider
      initialValues={INITIAL_VALUES}
      validationSchema={validationSchema}
      onSubmit={handleSubmit}
    >
      <Form>
        <Stack gap="xl">
          <BranchFormSelect
            name="branch"
            label={t`Branch`}
            placeholder={t`Select or create a branch`}
            data={branches}
            required
          />
          <FormErrorMessage />
          <Group justify="flex-end">
            <Button onClick={onClose}>{t`Cancel`}</Button>
            <FormSubmitButton variant="filled" label={t`Create`} />
          </Group>
        </Stack>
      </Form>
    </FormProvider>
  );
}

type BranchFormSelectProps = FormSelectProps & { data: string[] };

function BranchFormSelect({ data, name, ...rest }: BranchFormSelectProps) {
  const [{ value }] = useField<string | null>(name);

  const [searchValue, setSearchValue] = useState(value ?? "");
  const dataWithNewItem = [
    ...new Set([...data, ...(searchValue !== "" ? [searchValue] : [])]),
  ];

  const isNewValue = value !== "" && value != null && !data.includes(value);

  return (
    <Stack gap="sm">
      <FormSelect
        {...rest}
        name={name}
        data={dataWithNewItem}
        searchable
        searchValue={searchValue}
        onSearchChange={setSearchValue}
        renderOption={({ option }) => {
          const { value } = option;
          if (data.includes(value)) {
            return <SelectItem>{value}</SelectItem>;
          }
          return (
            <SelectItem>
              <Text c="inherit" lh="inherit">
                {jt`Create new branch ${<strong key="value">{value}</strong>}`}
              </Text>
            </SelectItem>
          );
        }}
      />
      {isNewValue && (
        <Text size="sm" c="text-secondary">
          {t`This branch will be created.`}
        </Text>
      )}
    </Stack>
  );
}
