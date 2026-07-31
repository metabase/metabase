import { useCallback, useMemo, useState } from "react";
import { t } from "ttag";

import { useToast } from "metabase/common/hooks";
import {
  Alert,
  Autocomplete,
  Button,
  Group,
  Icon,
  Modal,
  Stack,
  Text,
} from "metabase/ui";
import {
  useCreateBranchMutation,
  useCreateWorktreeMutation,
  useGetBranchesQuery,
  useImportChangesMutation,
  useListWorktreesQuery,
} from "metabase-enterprise/api";

import { trackBranchCreated } from "../../analytics";
import { parseSyncError } from "../../utils";

interface CreateWorktreeModalProps {
  onClose: () => void;
}

export const CreateWorktreeModal = ({ onClose }: CreateWorktreeModalProps) => {
  const [branch, setBranch] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [sendToast] = useToast();

  const { data: branchesData } = useGetBranchesQuery();
  const { data: worktrees = [] } = useListWorktreesQuery();

  const [createBranch] = useCreateBranchMutation();
  const [createWorktree] = useCreateWorktreeMutation();
  const [importChanges] = useImportChangesMutation();

  const branchName = branch.trim();
  const existingBranches = useMemo(
    () => branchesData?.items ?? [],
    [branchesData],
  );

  const availableBranches = useMemo(() => {
    const usedBranches = new Set(worktrees.map((worktree) => worktree.branch));
    return existingBranches.filter((name) => !usedBranches.has(name));
  }, [existingBranches, worktrees]);

  const isNewBranch =
    branchName.length > 0 && !existingBranches.includes(branchName);
  const hasWorktreeAlready = worktrees.some(
    (worktree) => worktree.branch === branchName,
  );

  const handleCreate = useCallback(async () => {
    setErrorMessage(null);
    setIsCreating(true);
    let worktree;
    try {
      if (isNewBranch) {
        await createBranch({ name: branchName }).unwrap();
        trackBranchCreated({ triggeredFrom: "branch-picker" });
      }
      worktree = await createWorktree({ branch: branchName }).unwrap();
    } catch (error) {
      const { errorMessage: message } = parseSyncError(error);
      setErrorMessage(message || t`Failed to create the worktree`);
      setIsCreating(false);
      return;
    }
    onClose();
    // Materialize the branch's content into the worktree right away; progress is
    // surfaced by the global sync progress modal. The modal is closed by now, so
    // failures go to a toast.
    try {
      await importChanges({
        branch: branchName,
        expected_branch: branchName,
        worktree_id: worktree.id,
      }).unwrap();
    } catch (error) {
      const { errorMessage: message } = parseSyncError(error);
      sendToast({
        message: message || t`Failed to pull into the worktree`,
        icon: "warning",
      });
    }
  }, [
    branchName,
    createBranch,
    createWorktree,
    importChanges,
    isNewBranch,
    onClose,
    sendToast,
  ]);

  return (
    <Modal
      opened
      title={t`Create a worktree`}
      onClose={onClose}
      padding="xl"
      size="md"
    >
      <Stack gap="md" pt="md">
        <Text c="text-secondary">
          {t`A worktree is a checked-out copy of a branch that you can edit and sync without affecting the rest of the app.`}
        </Text>

        {errorMessage && (
          <Alert color="error" icon={<Icon name="warning" />}>
            {errorMessage}
          </Alert>
        )}

        <Autocomplete
          data={availableBranches}
          value={branch}
          onChange={setBranch}
          label={t`Branch`}
          placeholder={t`Pick an existing branch or type a new name`}
          leftSection={<Icon name="git_branch" size={14} />}
          error={
            hasWorktreeAlready
              ? t`A worktree for this branch already exists.`
              : undefined
          }
        />

        {isNewBranch && (
          <Text c="text-secondary" fz="sm">
            {t`The "${branchName}" branch will be created from the current sync branch.`}
          </Text>
        )}

        <Group gap="sm" justify="end" mt="md">
          <Button variant="subtle" onClick={onClose}>
            {t`Cancel`}
          </Button>
          <Button
            variant="filled"
            disabled={branchName.length === 0 || hasWorktreeAlready}
            loading={isCreating}
            onClick={handleCreate}
          >
            {isNewBranch ? t`Create branch and worktree` : t`Create worktree`}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
};
