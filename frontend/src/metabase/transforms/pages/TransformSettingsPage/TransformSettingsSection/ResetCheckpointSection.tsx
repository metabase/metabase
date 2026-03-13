import { useDisclosure } from "@mantine/hooks";
import { useId } from "react";
import { t } from "ttag";

import {
  skipToken,
  useGetFieldQuery,
  useResetCheckpointMutation,
} from "metabase/api";
import { ConfirmModal } from "metabase/common/components/ConfirmModal";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { CheckpointValue } from "metabase/transforms/components/CheckpointValue";
import { isTransformRunning } from "metabase/transforms/utils";
import { Box, Button, Group, Icon, Text } from "metabase/ui";
import type { Transform } from "metabase-types/api";

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

  if (transform.last_checkpoint_value == null) {
    return null;
  }

  return (
    <Group gap="md" align="center">
      <Box c="text-secondary" role="group" aria-labelledby={labelId}>
        <span id={labelId}>{t`Current checkpoint`}: </span>
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
        {t`Reset checkpoint`}
      </Button>
      <ConfirmModal
        title={t`Reset checkpoint?`}
        message={t`This will cause the next run to reprocess all data from scratch instead of only new rows.`}
        opened={isModalOpen}
        onClose={closeModal}
        onConfirm={handleConfirm}
        confirmButtonText={t`Reset`}
      />
    </Group>
  );
}
