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
  Title,
} from "metabase/ui";
import { useExportChangesMutation } from "metabase-enterprise/api";
import type { Collection } from "metabase-types/api";

import { type SyncError, parseSyncError } from "../../utils";
import { ChangesLists } from "../ChangesLists";
import { SyncConflictModal } from "../SyncConflictModal";

import { CommitMessageSection } from "./CommitMessageSection";

interface PushChangesModalProps {
  collections: Collection[];
  currentBranch: string;
  onClose: () => void;
}

export const PushChangesModal = ({
  onClose,
  currentBranch,
  collections,
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
  }, [commitMessage, exportChanges, currentBranch]);

  if (hasConflict) {
    return (
      <SyncConflictModal
        collections={collections}
        currentBranch={currentBranch}
        onClose={onClose}
        variant="push"
      />
    );
  }

  return (
    <Modal
      opened
      title={<Title fw={600} order={3} pl="sm">{t`Push to Git`}</Title>}
      onClose={onClose}
      size="lg"
      styles={{
        body: { padding: 0 },
      }}
    >
      <Box px="xl" pt="md">
        {errorMessage && (
          <Alert mb="md" variant="error" icon={<Icon name="warning" />}>
            {errorMessage}
          </Alert>
        )}

        <Stack gap="lg">
          <ChangesLists collections={collections} title={t`Changes to push`} />

          <CommitMessageSection
            value={commitMessage}
            onChange={setCommitMessage}
          />
        </Stack>
      </Box>

      <Divider my="lg" />

      <Box px="xl" pb="lg">
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
