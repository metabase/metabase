import { useCallback, useMemo, useState } from "react";
import { t } from "ttag";

import { trackContentStudioWorktreeCreated } from "metabase/common/content-studio/analytics";
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
import { trackBranchCreated } from "metabase-enterprise/remote_sync/analytics";
import { parseSyncError } from "metabase-enterprise/remote_sync/utils";
import type { RemoteSyncWorktreeId } from "metabase-types/api";

interface CheckOutBranchModalProps {
  onClose: () => void;
  onCheckedOut?: (worktreeId: RemoteSyncWorktreeId) => void;
}

export const CheckOutBranchModal = ({
  onClose,
  onCheckedOut,
}: CheckOutBranchModalProps) => {
  const [branch, setBranch] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isCheckingOut, setIsCheckingOut] = useState(false);
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
    const checkedOutBranches = new Set(
      worktrees.map((worktree) => worktree.branch),
    );
    return existingBranches.filter((name) => !checkedOutBranches.has(name));
  }, [existingBranches, worktrees]);

  const isNewBranch =
    branchName.length > 0 && !existingBranches.includes(branchName);
  const isAlreadyCheckedOut = worktrees.some(
    (worktree) => worktree.branch === branchName,
  );

  const handleCheckOut = useCallback(async () => {
    setErrorMessage(null);
    setIsCheckingOut(true);
    let worktree;
    try {
      if (isNewBranch) {
        await createBranch({ name: branchName }).unwrap();
        trackBranchCreated({ triggeredFrom: "branch-picker" });
      }
      worktree = await createWorktree({ branch: branchName }).unwrap();
      trackContentStudioWorktreeCreated(worktree.id);
    } catch (error) {
      const { errorMessage: message } = parseSyncError(error);
      setErrorMessage(message || t`Failed to check out the branch`);
      setIsCheckingOut(false);
      return;
    }
    onClose();
    onCheckedOut?.(worktree.id);
    // Materialize the branch's content right away; progress is surfaced by the
    // global sync progress modal. The modal is closed by now, so failures go to
    // a toast.
    try {
      await importChanges({
        branch: branchName,
        expected_branch: branchName,
        worktree_id: worktree.id,
      }).unwrap();
    } catch (error) {
      const { errorMessage: message } = parseSyncError(error);
      sendToast({
        message: message || t`Failed to load the branch's content`,
        icon: "warning",
      });
    }
  }, [
    branchName,
    createBranch,
    createWorktree,
    importChanges,
    isNewBranch,
    onCheckedOut,
    onClose,
    sendToast,
  ]);

  return (
    <Modal
      opened
      title={t`Check out a branch`}
      onClose={onClose}
      padding="xl"
      size="md"
    >
      <Stack gap="md" pt="md">
        <Text c="text-secondary">
          {t`Checking out a branch makes a copy of its content that you can edit and sync without affecting the rest of the app.`}
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
            isAlreadyCheckedOut
              ? t`This branch is already checked out.`
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
            disabled={branchName.length === 0 || isAlreadyCheckedOut}
            loading={isCheckingOut}
            onClick={handleCheckOut}
          >
            {isNewBranch ? t`Create branch and check out` : t`Check out branch`}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
};
