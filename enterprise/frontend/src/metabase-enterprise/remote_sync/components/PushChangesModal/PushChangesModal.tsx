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
import {
  useExportChangesMutation,
  useLazyGetExportPreflightQuery,
} from "metabase-enterprise/api";
import type { ExportPreflightResponse } from "metabase-types/api";

import { trackPushChanges } from "../../analytics";
import { type SyncError, parseSyncError } from "../../utils";
import { ChangesLists } from "../ChangesLists";
import { SyncConflictModal } from "../SyncConflictModal";

import { CommitMessageSection } from "./CommitMessageSection";

interface PushChangesModalProps {
  currentBranch: string;
  onClose: () => void;
}

export const PushChangesModal = ({
  onClose,
  currentBranch,
}: PushChangesModalProps) => {
  const [commitMessage, setCommitMessage] = useState("");
  // Set once the export preflight detects the remote has advanced; switches the UI to the conflict modal
  // so the user can choose to merge, force push, or branch.
  const [preflight, setPreflight] = useState<ExportPreflightResponse | null>(
    null,
  );

  const [
    exportChanges,
    { isLoading: isPushing, error: exportError, isSuccess },
  ] = useExportChangesMutation();
  const [runPreflight, { isFetching: isCheckingPreflight }] =
    useLazyGetExportPreflightQuery();

  const { errorMessage } = useMemo(
    () => parseSyncError(exportError as SyncError),
    [exportError],
  );

  useEffect(() => {
    if (isSuccess) {
      onClose();
    }
  }, [isSuccess, onClose]);

  const handlePush = useCallback(async () => {
    if (!currentBranch) {
      throw new Error("Current branch is not set");
    }

    const message = commitMessage.trim() || undefined;
    const result = await runPreflight().unwrap();

    // Remote has advanced — hand off to the conflict modal so the user picks how to reconcile.
    if (result.has_changes) {
      setPreflight(result);
      return;
    }

    exportChanges({
      message,
      branch: currentBranch,
    });

    trackPushChanges({
      triggeredFrom: "app-bar",
      force: false,
    });
  }, [commitMessage, exportChanges, runPreflight, currentBranch]);

  if (preflight?.has_changes) {
    return (
      <SyncConflictModal
        currentBranch={currentBranch}
        onClose={onClose}
        variant="push"
        canMerge={preflight.clean}
        conflicts={preflight.conflicts}
        message={commitMessage.trim() || undefined}
      />
    );
  }

  const isBusy = isPushing || isCheckingPreflight;

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
          <Alert mb="md" variant="error" icon={<Icon name="warning" />}>
            {errorMessage}
          </Alert>
        )}

        <Stack gap="lg">
          <ChangesLists title={t`Changes to push`} />

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
            color="brand"
            disabled={isBusy}
            leftSection={<Icon name="upload" />}
            loading={isBusy}
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
