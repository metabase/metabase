import { t } from "ttag";

import { useToast } from "metabase/common/hooks";
import { Button, Group, Modal, Progress, Stack, Text } from "metabase/ui";
import {
  type SyncTaskType,
  useCancelSyncTaskMutation,
} from "metabase-enterprise/api";

interface LoadingModalProps {
  taskType: SyncTaskType;
  progress: number;
  isError: boolean;
  isSuccess: boolean;
  errorMessage: string;
  onDismiss: () => void;
}

export function LoadingModal({
  progress,
  taskType,
  isError,
  isSuccess,
  errorMessage,
  onDismiss,
}: LoadingModalProps) {
  const [cancelSyncTask, { isLoading: isCancelling }] =
    useCancelSyncTaskMutation();
  const [sendToast] = useToast();

  const onCancel = async () => {
    await cancelSyncTask()
      .unwrap()
      .catch((error) => {
        let message = t`Failed to cancel sync`;

        if (typeof error?.data === "string") {
          message += `: ${error.data}`;
        }

        sendToast({
          message,
          icon: "warning",
          toastColor: "error",
        });
      });
  };

  const handleReload = () => {
    window.location.reload();
  };

  if (isError) {
    return (
      <Modal onClose={onDismiss} opened size="md" title={t`Sync failed`}>
        <Stack gap="lg">
          <Text>{errorMessage || t`An error occurred during sync.`}</Text>
          <Group justify="flex-end">
            <Button onClick={onDismiss} variant="filled">{t`Close`}</Button>
          </Group>
        </Stack>
      </Modal>
    );
  }

  if (isSuccess) {
    return (
      <Modal
        onClose={onDismiss}
        opened
        size="md"
        title={
          taskType === "import" ? t`Content imported` : t`Changes pushed to Git`
        }
      >
        <Stack gap="lg">
          <Text>
            {taskType === "import"
              ? t`Your content has been imported. Reload the page to see the latest changes.`
              : t`Your changes have been pushed to Git successfully.`}
          </Text>
          <Group justify="flex-end">
            <Button variant="subtle" onClick={onDismiss}>{t`Dismiss`}</Button>
            <Button
              variant="filled"
              onClick={handleReload}
            >{t`Reload page`}</Button>
          </Group>
        </Stack>
      </Modal>
    );
  }

  const { title, progressLabel } = getModalContent(taskType, isCancelling);

  return (
    <Modal
      onClose={() => null}
      opened
      size="md"
      title={title}
      withCloseButton={false}
    >
      <Stack gap="lg">
        <Text ta="center">{progressLabel}</Text>
        <Progress value={progress * 100} transitionDuration={300} animated />
        <Text size="sm" c="text-medium">
          {t`Please wait until this finishes before editing content.`}
        </Text>
        {!isCancelling && (
          <Group justify="flex-end">
            <Button variant="subtle" onClick={onCancel}>
              {t`Cancel`}
            </Button>
          </Group>
        )}
      </Stack>
    </Modal>
  );
}

const getModalContent = (
  taskType: SyncTaskType,
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
      title: t`Syncing`,
      progressLabel: t`Importing content…`,
    };
  }

  return {
    title: t`Pushing to Git`,
    progressLabel: t`Exporting content…`,
  };
};
