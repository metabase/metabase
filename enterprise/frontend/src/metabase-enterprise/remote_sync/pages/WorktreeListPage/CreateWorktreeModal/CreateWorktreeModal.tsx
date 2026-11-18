import { useMemo, useState } from "react";
import { jt, t } from "ttag";
import _ from "underscore";

import { getErrorMessage } from "metabase/api/utils";
import {
  Button,
  Group,
  Modal,
  Select,
  SelectItem,
  Stack,
  Text,
} from "metabase/ui";
import {
  useCreateBranchMutation,
  useCreateWorktreeMutation,
  useGetRemoteSyncBranchesQuery,
} from "metabase-enterprise/api";
import type { RemoteSyncWorktree } from "metabase-types/api";

type CreateWorktreeModalProps = {
  opened: boolean;
  onCreate: (worktree: RemoteSyncWorktree) => void;
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
  onCreate: (worktree: RemoteSyncWorktree) => void;
  onClose: () => void;
};

function CreateWorktreeForm({ onCreate, onClose }: CreateWorktreeFormProps) {
  const { data, isLoading } = useGetRemoteSyncBranchesQuery();
  const [createBranch] = useCreateBranchMutation();
  const [createWorktree] = useCreateWorktreeMutation();
  const [searchValue, setSearchValue] = useState("");
  const [branch, setBranch] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const branches = useMemo(() => data?.items ?? [], [data]);
  const newBranchName = searchValue.trim();
  const options = _.uniq([
    ...branches,
    ...(newBranchName !== "" ? [newBranchName] : []),
  ]);
  const isNewBranch = branch != null && !branches.includes(branch);

  const handleSubmit = async () => {
    if (branch == null) {
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      if (isNewBranch) {
        await createBranch({ name: branch }).unwrap();
      }
      const worktree = await createWorktree({ branch }).unwrap();
      onCreate(worktree);
    } catch (error) {
      setError(getErrorMessage(error));
      setIsSubmitting(false);
    }
  };

  return (
    <Stack gap="lg">
      <Stack gap="sm">
        <Select
          label={t`Branch`}
          placeholder={
            isLoading ? t`Loading branches…` : t`Pick or type a branch`
          }
          data={options}
          value={branch}
          searchable
          searchValue={searchValue}
          nothingFoundMessage={t`No branches found`}
          disabled={isLoading}
          renderOption={({ option }) =>
            branches.includes(option.value) ? (
              <SelectItem>{option.value}</SelectItem>
            ) : (
              <NewBranchItem name={option.value} />
            )
          }
          onSearchChange={setSearchValue}
          onChange={setBranch}
        />
        {isNewBranch && (
          <Text size="sm" c="text-secondary">
            {t`This branch will be created from the main branch.`}
          </Text>
        )}
      </Stack>
      {error != null && <Text c="feedback-negative">{error}</Text>}
      <Group justify="flex-end" gap="sm">
        <Button onClick={onClose}>{t`Cancel`}</Button>
        <Button
          variant="filled"
          disabled={branch == null}
          loading={isSubmitting}
          onClick={handleSubmit}
        >
          {isNewBranch ? t`Create branch and worktree` : t`Create worktree`}
        </Button>
      </Group>
    </Stack>
  );
}

function NewBranchItem({ name }: { name: string }) {
  return (
    <SelectItem>
      <Text c="inherit" lh="inherit">
        {jt`Create new branch ${<strong key="name">{name}</strong>}`}
      </Text>
    </SelectItem>
  );
}
