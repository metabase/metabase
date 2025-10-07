import { t } from "ttag";

import { useToast } from "metabase/common/hooks";
import { Box, Button, Group, Modal, Progress, Text } from "metabase/ui";
import {
  type SyncTaskType,
  useCancelSyncTaskMutation,
} from "metabase-enterprise/api";

interface LoadingModalProps {
  taskType: SyncTaskType;
  progress: number;
}

export function LoadingModal({ progress, taskType }: LoadingModalProps) {
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

  return (
    <Modal
      onClose={() => null} // modal can't be closed
      opened
      size="sm"
      title={t`Syncing`}
      withCloseButton={false}
    >
      <Box p="xl">
        <Text mb="md" ta="center">
          {getHeading(taskType, isCancelling)}...
        </Text>
        <Progress value={progress * 100} transitionDuration={300} animated />
        <Text fz="sm" lh="sm" mt="lg">
          {t`Please wait until the sync completes to edit content.`}
        </Text>
      </Box>
      {!isCancelling && (
        <Group px="xl" justify="flex-end">
          <Button variant="subtle" onClick={onCancel} p={0}>
            {t`Cancel sync`}
          </Button>
        </Group>
      )}
    </Modal>
  );
}

const getHeading = (taskType: SyncTaskType, isCancelling?: boolean) => {
  if (isCancelling) {
    return t`Cancelling`;
  }

  return taskType === "import" ? t`Importing` : t`Exporting`;
};
