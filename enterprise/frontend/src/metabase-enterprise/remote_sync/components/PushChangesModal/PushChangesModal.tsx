import { useCallback, useMemo, useState } from "react";
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

import { CommitMessageSection } from "./CommitMessageSection";

interface PushChangesModalProps {
  opened: boolean;
  onClose: () => void;
}

/**
 * Plain push of local changes. Only shown when the remote has NOT advanced — the caller
 * (GitSyncControls) runs the export preflight first and, when the remote is ahead, opens the
 * SyncConflictModal (push variant) directly instead of this modal.
 */
export const PushChangesModal = ({
  opened,
  onClose,
}: PushChangesModalProps) => (
  <Modal
    opened={opened}
    title={t`Push to Git`}
    onClose={onClose}
    size="lg"
    padding="xxl"
  >
    <PushChangesForm onClose={onClose} />
  </Modal>
);

const PushChangesForm = ({
  onClose,
}: Omit<PushChangesModalProps, "opened">) => {
  const [commitMessage, setCommitMessage] = useState("");

  const [exportChanges, { isLoading: isPushing, error: exportError }] =
    useExportChangesMutation();

  const { errorMessage } = useMemo(
    // Unjustified type cast. FIXME
    () => parseSyncError(exportError as SyncError),
    [exportError],
  );

  const handlePush = useCallback(async () => {
    const { error } = await exportChanges({
      message: commitMessage.trim() || undefined,
    });

    if (error) {
      return;
    }

    trackPushChanges({
      triggeredFrom: "app-bar",
      force: false,
    });
    onClose();
  }, [commitMessage, exportChanges, onClose]);

  return (
    <>
      <Box pt="lg">
        {errorMessage && (
          <Alert
            size="compact"
            mb="lg"
            color="error"
            icon={<Icon name="warning" />}
          >
            {errorMessage}
          </Alert>
        )}

        <Stack gap="xl">
          <ChangesLists title={t`Changes to push`} />

          <CommitMessageSection
            value={commitMessage}
            onChange={setCommitMessage}
          />
        </Stack>
      </Box>

      <Divider my="xl" />

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
    </>
  );
};
