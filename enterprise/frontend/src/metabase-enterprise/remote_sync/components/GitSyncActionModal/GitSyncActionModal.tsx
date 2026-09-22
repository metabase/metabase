import { useState } from "react";
import { useMount } from "react-use";
import { t } from "ttag";

import { useToast } from "metabase/common/hooks";
import { Button, Group, Modal, Text } from "metabase/ui";
import {
  useImportChangesMutation,
  useLazyGetExportPreflightQuery,
} from "metabase-enterprise/api";

import { trackPullChanges } from "../../analytics";
import { type SyncError, parseSyncError } from "../../utils";
import { PushChangesModal } from "../PushChangesModal";
import { SyncConflictModal } from "../SyncConflictModal";

export type GitSyncAction = "push" | "pull";

type GitSyncActionModalProps = {
  opened: boolean;
  action: GitSyncAction;
  branch: string;
  isDirty: boolean;
  worktreeId?: number;
  onClose: () => void;
};

export function GitSyncActionModal({
  opened,
  action,
  branch,
  isDirty,
  worktreeId,
  onClose,
}: GitSyncActionModalProps) {
  if (!opened) {
    return null;
  }
  return (
    <GitSyncActionModalBody
      action={action}
      branch={branch}
      isDirty={isDirty}
      worktreeId={worktreeId}
      onClose={onClose}
    />
  );
}

function GitSyncActionModalBody({
  action,
  branch,
  isDirty,
  worktreeId,
  onClose,
}: Omit<GitSyncActionModalProps, "opened">) {
  const [sendToast] = useToast();
  const [runExportPreflight, preflight] = useLazyGetExportPreflightQuery();
  const [importChanges, pull] = useImportChangesMutation();
  const [branchMismatch, setBranchMismatch] = useState<string | null>(null);

  const showBranchMismatch = (error: unknown) => {
    // Unjustified type cast. FIXME
    const syncError = error as SyncError;
    const { hasBranchMismatch, errorMessage } = parseSyncError(syncError);
    if (hasBranchMismatch) {
      setBranchMismatch(
        errorMessage ?? t`The sync branch changed in another session.`,
      );
    }
    return hasBranchMismatch;
  };

  const runPreflight = async () => {
    const { error } = await runExportPreflight({
      branch,
      "worktree-id": worktreeId,
    });

    if (error == null) {
      return;
    }
    if (showBranchMismatch(error)) {
      return;
    }
    if (action === "pull") {
      sendToast({
        message: t`Couldn't check whether your changes can be merged. You can still force the pull or stash to a new branch.`,
        icon: "warning",
      });
    }
  };

  const runPull = async () => {
    const { error } = await importChanges({
      branch,
      expected_branch: branch,
      worktree_id: worktreeId,
    });

    if (error == null) {
      trackPullChanges({
        triggeredFrom: worktreeId == null ? "app-bar" : "branch-menu",
        force: false,
      });
      onClose();
      return;
    }
    if (showBranchMismatch(error)) {
      return;
    }

    // Unjustified type cast. FIXME
    const syncError = error as SyncError;
    const { hasConflict, errorMessage } = parseSyncError(syncError);
    if (!hasConflict) {
      sendToast({
        message: errorMessage || t`Failed to pull from remote`,
        icon: "warning",
      });
      onClose();
    }
  };

  // A push, and a pull that would clobber un-pushed work, both need to know whether the remote has
  // advanced before anything is written; a clean pull just imports.
  const needsPreflight = action === "push" || isDirty;

  useMount(() => {
    if (needsPreflight) {
      runPreflight();
    } else {
      runPull();
    }
  });

  // Unjustified type cast. FIXME
  const pullError = pull.error as SyncError | undefined;
  const hasConflict = needsPreflight
    ? action === "pull" || preflight.data?.has_changes === true
    : pullError != null && parseSyncError(pullError).hasConflict;
  const isDeciding = needsPreflight
    ? preflight.isUninitialized || preflight.isFetching
    : pull.isUninitialized || pull.isLoading;

  if (isDeciding) {
    return null;
  }

  if (branchMismatch) {
    return (
      <Modal
        opened
        padding="xxl"
        title={t`This view is out of date`}
        withCloseButton={false}
        onClose={onClose}
      >
        <Text mt="lg">{branchMismatch}</Text>
        <Group gap="sm" justify="end" mt="xxl">
          <Button variant="subtle" onClick={onClose}>
            {t`Cancel`}
          </Button>
          <Button variant="filled" onClick={() => window.location.reload()}>
            {t`Refresh`}
          </Button>
        </Group>
      </Modal>
    );
  }

  if (hasConflict) {
    return (
      <SyncConflictModal
        opened
        currentBranch={branch}
        variant={action}
        canMerge={preflight.data?.clean}
        conflicts={preflight.data?.conflicts}
        forcePushCasualties={preflight.data?.force_push_casualties}
        historyRewritten={preflight.data?.reason === "history-rewritten"}
        worktreeId={worktreeId}
        onClose={onClose}
      />
    );
  }

  return (
    <PushChangesModal
      opened
      currentBranch={branch}
      worktreeId={worktreeId}
      onClose={onClose}
    />
  );
}
