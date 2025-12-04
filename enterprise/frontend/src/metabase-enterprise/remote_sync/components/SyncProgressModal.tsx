import { t } from "ttag";

import { useToast } from "metabase/common/hooks";
import { useSelector } from "metabase/lib/redux";
import { getUserIsAdmin } from "metabase/selectors/user";
import { Button, Group, Modal, Progress, Stack, Text } from "metabase/ui";
import { useCancelRemoteSyncCurrentTaskMutation } from "metabase-enterprise/api";
import type { RemoteSyncTaskType } from "metabase-types/api";

interface SyncProgressModalProps {
  taskType: RemoteSyncTaskType;
  progress: number;
  isError: boolean;
  errorMessage: string;
  onDismiss: () => void;
}

export function SyncProgressModal({
  progress,
  taskType,
  isError,
  errorMessage,
  onDismiss,
}: SyncProgressModalProps) {
  const canCancel = useSelector(getUserIsAdmin);

  const [cancelRemoteSyncCurrentTask, { isLoading: isCancelling }] =
    useCancelRemoteSyncCurrentTaskMutation();
  const [sendToast] = useToast();

  const onCancel = async () => {
    if (!canCancel) {
      return;
    }

    await cancelRemoteSyncCurrentTask()
      .unwrap()
      .catch((error: any) => {
        let message = t`Failed to cancel sync`;

        if (typeof error?.data === "string") {
          message += `: ${error.data}`;
        }

        sendToast({
          message,
          icon: "warning",
          toastColor: "error",
        });

        if (message.match(/no active task/i)) {
          onDismiss();
        }
      });
  };

  if (isError) {
    return (
      <Modal onClose={onDismiss} opened size="md" title={t`Sync failed`}>
        <Stack mt="md" gap="md">
          <Text>{t`An error occurred during sync.`}</Text>
          {errorMessage && <Text>{errorMessage}</Text>}
          <Group justify="flex-end">
            <Button onClick={onDismiss} variant="filled">{t`Close`}</Button>
          </Group>
        </Stack>
      </Modal>
    );
  }

  const { title, progressLabel } = getModalContent(taskType, isCancelling);

  return (
    <Modal
      onClose={onDismiss}
      opened
      size="md"
      title={title}
      withCloseButton={false}
    >
      <Stack mt="md" gap="md">
        <Text ta="center">{progressLabel}</Text>
        <Progress value={progress * 100} transitionDuration={300} animated />
        <Text size="sm">
          {t`Please wait until this finishes before editing content.`}
        </Text>
        {!isCancelling && canCancel && (
          <Group justify="flex-end">
            <Button onClick={onCancel}>{t`Cancel`}</Button>
          </Group>
        )}
      </Stack>
    </Modal>
  );
}

const getModalContent = (
  taskType: RemoteSyncTaskType,
  isCancelling?: boolean,
): { title: string; progressLabel: string } => {
  if (isCancelling) {
    return {
      title: t`Cancelling`,
      progressLabel: "",
    };
  }

  if (taskType === "import") {
    return {
      title: t`Pulling from Git`,
      progressLabel: t`Importing content…`,
    };
  }

  return {
    title: t`Pushing to Git`,
    progressLabel: t`Exporting content…`,
  };
};
