import { useMemo, useState } from "react";
import { t } from "ttag";

import { getErrorMessage } from "metabase/api/utils";
import { useToast } from "metabase/common/hooks";
import { useNavigate } from "metabase/router";
import {
  Autocomplete,
  Button,
  Group,
  Icon,
  Modal,
  Stack,
  Text,
} from "metabase/ui";
import * as Urls from "metabase/urls";
import {
  useCreateBranchMutation,
  useCreateWorktreeMutation,
  useGetBranchesQuery,
  useImportChangesMutation,
} from "metabase-enterprise/api";
import type { Worktree } from "metabase-types/api";

type NewWorktreeModalProps = {
  onClose: () => void;
};

export function NewWorktreeModal({ onClose }: NewWorktreeModalProps) {
  const [branch, setBranch] = useState("");
  const { data: branchesData, isLoading: isLoadingBranches } =
    useGetBranchesQuery();
  const [createBranch] = useCreateBranchMutation();
  const [createWorktree] = useCreateWorktreeMutation();
  const [importChanges] = useImportChangesMutation();
  const [isCreating, setIsCreating] = useState(false);
  const [sendToast] = useToast();
  const navigate = useNavigate();

  const branches = useMemo(() => branchesData?.items ?? [], [branchesData]);
  const trimmedBranch = branch.trim();
  const isNewBranch =
    trimmedBranch.length > 0 && !branches.includes(trimmedBranch);

  // Materializes the branch's content into the worktree so it doesn't open
  // empty. The worktree already exists by now, so a failed pull is reported
  // without blocking navigation: the worktree home page offers Pull to retry.
  const pullIntoWorktree = async (worktree: Worktree) => {
    try {
      await importChanges({
        expected_branch: trimmedBranch,
        worktree_id: worktree.id,
      }).unwrap();
    } catch (error) {
      sendToast({
        message: t`Worktree created, but pulling "${trimmedBranch}" failed: ${getErrorMessage(error)}`,
        icon: "warning",
      });
    }
  };

  const handleCreate = async () => {
    setIsCreating(true);
    try {
      if (isNewBranch) {
        await createBranch({ name: trimmedBranch, checkout: false }).unwrap();
      }
      const worktree = await createWorktree({ branch: trimmedBranch }).unwrap();
      await pullIntoWorktree(worktree);
      onClose();
      navigate(Urls.transformList({ worktreeId: worktree.id }));
    } catch (error) {
      sendToast({
        message: getErrorMessage(error, t`Failed to create worktree`),
        icon: "warning",
      });
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Modal title={t`New worktree`} opened padding="xl" onClose={onClose}>
      <Stack gap="lg" mt="sm">
        <Text c="text-secondary">
          {t`A worktree checks out a branch's content so you can work on it without affecting the instance.`}
        </Text>
        <Autocomplete
          label={t`Branch`}
          placeholder={t`Find or create a branch…`}
          data={branches}
          value={branch}
          onChange={setBranch}
          leftSection={<Icon name="git_branch" />}
          disabled={isLoadingBranches}
          data-autofocus
        />
        {isNewBranch && (
          <Text size="sm" c="text-secondary">
            {t`The branch "${trimmedBranch}" will be created.`}
          </Text>
        )}
        <Group justify="flex-end">
          <Button onClick={onClose}>{t`Cancel`}</Button>
          <Button
            variant="filled"
            disabled={trimmedBranch.length === 0}
            loading={isCreating}
            onClick={handleCreate}
          >
            {t`Create worktree`}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
