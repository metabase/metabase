import { t } from "ttag";

import { useToast } from "metabase/common/hooks";
import { useSelector } from "metabase/lib/redux";
import { getUserIsAdmin } from "metabase/selectors/user";
import { Button, Group, Modal, Progress, Stack, Text } from "metabase/ui";
import {
  type SyncTaskType,
  useCancelSyncTaskMutation,
} from "metabase-enterprise/api";

interface SyncProgressModalProps {
  taskType: SyncTaskType;
  progress: number;
  isError: boolean;
  isSuccess: boolean;
  errorMessage: string;
  onDismiss: () => void;
}

export function SyncProgressModal({
  progress,
  taskType,
  isError,
  isSuccess,
  errorMessage,
  onDismiss,
}: SyncProgressModalProps) {
  const canCancel = useSelector(getUserIsAdmin);

  const [cancelSyncTask, { isLoading: isCancelling }] =
    useCancelSyncTaskMutation();
  const [sendToast] = useToast();

  const onCancel = async () => {
    if (!canCancel) {
      return;
    }

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
        <Stack mt="md" gap="md">
          <Text>
            {taskType === "import"
              ? t`Your content has been imported. Reload the page to see the latest changes.`
              : t`Your changes have been pushed to Git successfully.`}
          </Text>
          <Group justify="flex-end">
            <Button variant="outline" onClick={onDismiss}>
              {taskType === "import" ? t`Dismiss` : t`Close`}
            </Button>
            {taskType === "import" ? (
              <Button
                variant="filled"
                onClick={handleReload}
              >{t`Reload page`}</Button>
            ) : null}
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
      title: t`Pulling from Git`,
      progressLabel: t`Importing content…`,
    };
  }

  return {
    title: t`Pushing to Git`,
    progressLabel: t`Exporting content…`,
  };
};
