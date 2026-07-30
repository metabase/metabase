import { useDisclosure } from "@mantine/hooks";
import { useId } from "react";
import { jt, t } from "ttag";

import {
  skipToken,
  useGetFieldQuery,
  useResetCheckpointMutation,
} from "metabase/api";
import { ConfirmModal } from "metabase/common/components/ConfirmModal";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { CheckpointValue } from "metabase/transforms/components/CheckpointValue";
import {
  hasCodeManagedSyncCursor,
  isTransformRunning,
} from "metabase/transforms/utils";
import { Box, Button, Code, Group, Icon, Text } from "metabase/ui";
import type { Transform } from "metabase-types/api";

function SyncCursorSection({
  transform,
  onReset,
  isResetting,
}: {
  transform: Transform;
  onReset: () => void;
  isResetting: boolean;
}) {
  const labelId = useId();

  return (
    <Group gap="md" align="center">
      <Box c="text-secondary" role="group" aria-labelledby={labelId}>
        <span id={labelId}>{t`Sync state`}: </span>
        <Code bg="background_page-tertiary" style={{ whiteSpace: "pre-wrap" }}>
          {JSON.stringify(transform.sync_state)}
        </Code>
      </Box>
      <Button
        leftSection={<Icon name="revert" aria-hidden />}
        disabled={isTransformRunning(transform) || isResetting}
        onClick={onReset}
      >
        {t`Reset state`}
      </Button>
    </Group>
  );
}

export function ResetCheckpointSection({
  transform,
}: {
  transform: Transform;
}) {
  const [isModalOpen, { open: openModal, close: closeModal }] = useDisclosure();
  const { sendSuccessToast, sendErrorToast } = useMetadataToasts();
  const [resetCheckpoint, { isLoading }] = useResetCheckpointMutation();

  const checkpointFieldId =
    transform.source?.["source-incremental-strategy"]?.[
      "checkpoint-filter-field-id"
    ];
  const { data: checkpointField } = useGetFieldQuery(
    checkpointFieldId ? { id: checkpointFieldId } : skipToken,
  );

  const labelId = useId();

  const handleConfirm = async () => {
    const { error } = await resetCheckpoint(transform.id);
    closeModal();
    if (error) {
      sendErrorToast(t`Failed to reset checkpoint`);
    } else {
      sendSuccessToast(t`Checkpoint has been reset`);
    }
  };

  // An ingestion transform has no checkpoint field: its state is whatever its code returned,
  // so show that instead. Resetting it is the same endpoint — it clears both.
  const isCodeManaged =
    transform.source != null && hasCodeManagedSyncCursor(transform.source);
  if (isCodeManaged) {
    if (transform.sync_state == null) {
      return null;
    }
    return (
      <>
        <SyncCursorSection
          transform={transform}
          onReset={openModal}
          isResetting={isLoading}
        />
        <ConfirmModal
          title={t`Reset the sync state?`}
          message={t`The next run will start from scratch instead of continuing from the stored position. Depending on the transform, this may re-fetch everything from the source.`}
          opened={isModalOpen}
          onClose={closeModal}
          onConfirm={handleConfirm}
          confirmButtonText={t`Reset state`}
        />
      </>
    );
  }

  if (transform.last_checkpoint_value == null) {
    return null;
  }

  const checkpointFieldName = checkpointField?.display_name;
  const label = checkpointFieldName
    ? jt`Last processed ${(
        <Code key="field" bg="background_page-tertiary">
          {checkpointFieldName}
        </Code>
      )}`
    : t`Last processed record`;

  return (
    <Group gap="md" align="center">
      <Box c="text-secondary" role="group" aria-labelledby={labelId}>
        <span id={labelId}>{label}: </span>
        <Text component="span" fw="bold" c="text-primary">
          <CheckpointValue
            value={transform.last_checkpoint_value}
            checkpointField={checkpointField}
          />
        </Text>
      </Box>
      <Button
        leftSection={<Icon name="revert" aria-hidden />}
        disabled={isTransformRunning(transform) || isLoading}
        onClick={openModal}
      >
        {t`Reprocess all data`}
      </Button>
      <ConfirmModal
        title={t`Reprocess all data?`}
        message={t`This will cause the next run to reprocess all data from scratch instead of only new rows.`}
        opened={isModalOpen}
        onClose={closeModal}
        onConfirm={handleConfirm}
        confirmButtonText={t`Reprocess on next run`}
      />
    </Group>
  );
}
