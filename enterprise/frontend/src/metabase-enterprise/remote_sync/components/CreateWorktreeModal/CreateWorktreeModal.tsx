import { useMemo, useState } from "react";
import { t } from "ttag";

import { getErrorMessage } from "metabase/api/utils";
import { Button, Group, Modal, Select, Stack, Text } from "metabase/ui";
import {
  useCreateRemoteSyncBranchMutation,
  useCreateWorktreeMutation,
  useGetRemoteSyncBranchesQuery,
} from "metabase-enterprise/api";
import type { Worktree } from "metabase-types/api";

const NEW_BRANCH_VALUE_PREFIX = "new-branch:";

type CreateWorktreeModalProps = {
  opened: boolean;
  onCreate: (worktree: Worktree) => void;
  onClose: () => void;
};

export function CreateWorktreeModal({
  opened,
  onCreate,
  onClose,
}: CreateWorktreeModalProps) {
  return (
    <Modal opened={opened} title={t`New worktree`} onClose={onClose}>
      {opened && <CreateWorktreeForm onCreate={onCreate} onClose={onClose} />}
    </Modal>
  );
}

type CreateWorktreeFormProps = {
  onCreate: (worktree: Worktree) => void;
  onClose: () => void;
};

type SelectedBranch = {
  name: string;
  isNew: boolean;
};

function CreateWorktreeForm({ onCreate, onClose }: CreateWorktreeFormProps) {
  const { data, isLoading } = useGetRemoteSyncBranchesQuery();
  const [createBranch] = useCreateRemoteSyncBranchMutation();
  const [createWorktree] = useCreateWorktreeMutation();
  const [searchValue, setSearchValue] = useState("");
  const [selected, setSelected] = useState<SelectedBranch | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const branches = useMemo(() => data?.items ?? [], [data]);
  const newBranchName = searchValue.trim();
  const canCreateBranch =
    newBranchName.length > 0 && !branches.includes(newBranchName);

  const options = useMemo(
    () => [
      ...branches.map((branch) => ({ value: branch, label: branch })),
      ...(canCreateBranch
        ? [
            {
              value: `${NEW_BRANCH_VALUE_PREFIX}${newBranchName}`,
              label: newBranchName,
            },
          ]
        : []),
    ],
    [branches, canCreateBranch, newBranchName],
  );

  const handleChange = (value: string | null) => {
    if (value == null) {
      setSelected(null);
    } else if (value.startsWith(NEW_BRANCH_VALUE_PREFIX)) {
      setSelected({
        name: value.slice(NEW_BRANCH_VALUE_PREFIX.length),
        isNew: true,
      });
    } else {
      setSelected({ name: value, isNew: false });
    }
  };

  const handleSubmit = async () => {
    if (selected == null) {
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      if (selected.isNew) {
        await createBranch({ name: selected.name }).unwrap();
      }
      const worktree = await createWorktree({ branch: selected.name }).unwrap();
      onCreate(worktree);
    } catch (error) {
      setError(getErrorMessage(error));
      setIsSubmitting(false);
    }
  };

  const selectValue = selected?.isNew
    ? `${NEW_BRANCH_VALUE_PREFIX}${selected.name}`
    : selected?.name;

  return (
    <Stack gap="lg">
      <Select
        label={t`Branch`}
        placeholder={
          isLoading ? t`Loading branches…` : t`Pick or type a branch`
        }
        data={options}
        value={selectValue ?? null}
        searchable
        searchValue={searchValue}
        nothingFoundMessage={t`No branches found`}
        disabled={isLoading}
        renderOption={({ option }) =>
          option.value.startsWith(NEW_BRANCH_VALUE_PREFIX)
            ? t`Create “${option.label}”`
            : option.label
        }
        onSearchChange={setSearchValue}
        onChange={handleChange}
      />
      {error != null && <Text c="feedback-negative">{error}</Text>}
      <Group justify="flex-end" gap="sm">
        <Button onClick={onClose}>{t`Cancel`}</Button>
        <Button
          variant="filled"
          disabled={selected == null}
          loading={isSubmitting}
          onClick={handleSubmit}
        >
          {selected?.isNew ? t`Create branch and worktree` : t`Create worktree`}
        </Button>
      </Group>
    </Stack>
  );
}
