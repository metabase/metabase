import { useCallback, useEffect, useMemo, useState } from "react";
import { t } from "ttag";

import { useAdminSetting } from "metabase/api/utils";
import {
  Alert,
  Box,
  Button,
  Card,
  Divider,
  Group,
  Icon,
  Modal,
  Stack,
  Text,
  Title,
} from "metabase/ui";
import type { Collection } from "metabase-types/api";

import { useExportChangesMutation } from "../../../api";
import { type ExportError, parseExportError } from "../../utils";
import { ChangesLists } from "../ChangesLists";

import { CommitMessageSection } from "./CommitMessageSection";

interface PushChangesModalProps {
  isOpen: boolean;
  onClose: () => void;
  collections: Collection[];
}

export const PushChangesModal = ({
  isOpen,
  onClose,
  collections,
}: PushChangesModalProps) => {
  const [commitMessage, setCommitMessage] = useState("");
  const [forceMode, setForceMode] = useState(false);
  const { value: currentBranch } = useAdminSetting("remote-sync-branch");

  const [
    exportChanges,
    { isLoading: isPushing, error: exportError, isSuccess },
  ] = useExportChangesMutation();

  const { errorMessage, hasConflict } = useMemo(
    () => parseExportError(exportError as ExportError),
    [exportError],
  );

  useEffect(() => {
    if (hasConflict) {
      setForceMode(true);
    }
  }, [hasConflict]);

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
      forceSync: forceMode,
      branch: currentBranch,
    });
  }, [commitMessage, forceMode, exportChanges, currentBranch]);

  return (
    <Modal
      opened={isOpen}
      title={<Title fw={600} order={3} pl="sm">{t`Push to Git`}</Title>}
      onClose={onClose}
      size="lg"
      styles={{
        body: { padding: 0 },
      }}
    >
      <Box px="xl" pt="md">
        {errorMessage && (
          <Alert
            mb="md"
            variant={hasConflict ? "warning" : "error"}
            icon={<Icon name={hasConflict ? "info" : "warning"} />}
          >
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
        {hasConflict && (
          <Card bg="warning-light" p="sm" mb="md">
            <Group gap="xs">
              <Icon name="warning" c="warning" />
              <Text size="sm" c="warning-dark">
                {t`Force pushing will replace the remote version with your changes`}
              </Text>
            </Group>
          </Card>
        )}

        <Group gap="sm" justify="end">
          <Button variant="subtle" onClick={onClose}>
            {t`Cancel`}
          </Button>
          <Button
            variant="filled"
            color={forceMode ? "warning" : "brand"}
            onClick={handlePush}
            disabled={isPushing}
            loading={isPushing}
            leftSection={
              forceMode ? <Icon name="warning" /> : <Icon name="upload" />
            }
          >
            {forceMode ? t`Force push` : t`Push changes`}
          </Button>
        </Group>
      </Box>
    </Modal>
  );
};
