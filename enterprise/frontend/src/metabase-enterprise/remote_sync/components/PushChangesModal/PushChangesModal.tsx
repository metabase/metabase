import { useCallback, useEffect, useMemo, useState } from "react";
import { t } from "ttag";

import {
  Alert,
  Box,
  Button,
  Divider,
  Group,
  Icon,
  Modal,
  Stack,
} from "metabase/ui";
import { useExportChangesMutation } from "metabase-enterprise/api";
import type { RemoteSyncWorktreeId } from "metabase-types/api";

import { trackPushChanges } from "../../analytics";
import { parseSyncError } from "../../utils";
import { ChangesLists } from "../ChangesLists";

import { CommitMessageSection } from "./CommitMessageSection";

interface PushChangesModalProps {
  currentBranch: string;
  onClose: () => void;
  /** Push a worktree's content to its own branch instead of the main app's. */
  worktreeId?: RemoteSyncWorktreeId;
}

/**
 * Plain push of local changes. Only shown when the remote has NOT advanced — the caller
 * (GitSyncControls) runs the export preflight first and, when the remote is ahead, opens the
 * SyncConflictModal (push variant) directly instead of this modal.
 */
export const PushChangesModal = ({
  onClose,
  currentBranch,
  worktreeId,
}: PushChangesModalProps) => {
  const [commitMessage, setCommitMessage] = useState("");

  const [
    exportChanges,
    { isLoading: isPushing, error: exportError, isSuccess },
  ] = useExportChangesMutation();

  const { errorMessage } = useMemo(
    () => parseSyncError(exportError),
    [exportError],
  );

  useEffect(() => {
    if (isSuccess) {
      onClose();
    }
  }, [isSuccess, onClose]);

  const handlePush = useCallback(() => {
    if (!currentBranch) {
      throw new Error("Current branch is not set");
    }

    exportChanges({
      message: commitMessage.trim() || undefined,
      branch: currentBranch,
      worktree_id: worktreeId,
    });

    trackPushChanges({
      triggeredFrom: "app-bar",
      force: false,
    });
  }, [commitMessage, exportChanges, currentBranch, worktreeId]);

  return (
    <Modal
      opened
      title={t`Push to Git`}
      onClose={onClose}
      size="lg"
      padding="xl"
    >
      <Box pt="md">
        {errorMessage && (
          <Alert
            size="compact"
            mb="md"
            color="error"
            icon={<Icon name="warning" />}
          >
            {errorMessage}
          </Alert>
        )}

        <Stack gap="lg">
          <ChangesLists title={t`Changes to push`} worktreeId={worktreeId} />

          <CommitMessageSection
            value={commitMessage}
            onChange={setCommitMessage}
          />
        </Stack>
      </Box>

      <Divider my="lg" />

      <Box>
        <Group gap="sm" justify="end">
          <Button variant="subtle" onClick={onClose}>
            {t`Cancel`}
          </Button>
          <Button
            color="core-brand"
            disabled={isPushing}
            leftSection={<Icon name="upload" />}
            loading={isPushing}
            onClick={handlePush}
            variant="filled"
          >
            {t`Push changes`}
          </Button>
        </Group>
      </Box>
    </Modal>
  );
};
