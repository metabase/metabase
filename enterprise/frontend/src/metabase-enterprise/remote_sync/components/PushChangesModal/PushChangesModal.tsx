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

  const [
    exportChanges,
    { isLoading: isPushing, error: exportError, isSuccess },
  ] = useExportChangesMutation();

  const { errorMessage, hasConflict } = useMemo(
    () => parseSyncError(exportError as SyncError),
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
    });

    trackPushChanges({
      triggeredFrom: "app-bar",
      force: false,
    });
  }, [commitMessage, exportChanges, currentBranch]);

  if (hasConflict) {
    return (
      <SyncConflictModal
        currentBranch={currentBranch}
        onClose={onClose}
        variant="push"
      />
    );
  }

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
