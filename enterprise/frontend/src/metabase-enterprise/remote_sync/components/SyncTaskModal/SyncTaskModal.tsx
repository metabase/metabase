import { useEffect, useState } from "react";
import { match } from "ts-pattern";
import { t } from "ttag";

import { useToast } from "metabase/common/hooks";
import { useDispatch } from "metabase/redux";
import { Button, Group, List, Modal, Progress, Stack, Text } from "metabase/ui";
import {
  EnterpriseApi,
  useCancelRemoteSyncCurrentTaskMutation,
  useGetRemoteSyncCurrentTaskQuery,
} from "metabase-enterprise/api";
import { ENTERPRISE_TAG_TYPES } from "metabase-enterprise/api/tags";
import type { RemoteSyncTask, RemoteSyncTaskId } from "metabase-types/api";

import { TASK_POLLING_INTERVAL_MS } from "../../constants";

type SyncTaskModalProps = {
  title: string;
  taskId: RemoteSyncTaskId | null;
  onClose: () => void;
};

export const SyncTaskModal = ({
  title,
  taskId,
  onClose,
}: SyncTaskModalProps) => (
  <Modal
    opened={taskId != null}
    title={title}
    closeOnClickOutside={false}
    closeOnEscape={false}
    withCloseButton={false}
    onClose={onClose}
  >
    {taskId != null && <SyncTaskModalBody taskId={taskId} onClose={onClose} />}
  </Modal>
);

type SyncTaskModalBodyProps = {
  taskId: RemoteSyncTaskId;
  onClose: () => void;
};

const SyncTaskModalBody = ({ taskId, onClose }: SyncTaskModalBodyProps) => {
  const task = useSyncTask(taskId, onClose);

  if (
    task == null ||
    task.status === "running" ||
    task.status === "successful"
  ) {
    return <RunningTask progress={task?.progress ?? 0} />;
  }

  return <FinishedTask task={task} onClose={onClose} />;
};

const useSyncTask = (
  taskId: RemoteSyncTaskId,
  onSuccess: () => void,
): RemoteSyncTask | undefined => {
  const [isPolling, setIsPolling] = useState(true);
  const { data } = useGetRemoteSyncCurrentTaskQuery(undefined, {
    pollingInterval: isPolling ? TASK_POLLING_INTERVAL_MS : 0,
    refetchOnMountOrArgChange: true,
  });
  const task = data?.id === taskId ? data : undefined;
  const status = task?.status;
  const outcome = task?.outcome;
  const dispatch = useDispatch();
  const [sendToast] = useToast();

  useEffect(() => {
    if (!isPolling || status == null || status === "running") {
      return;
    }
    setIsPolling(false);
    if (status === "successful") {
      dispatch(EnterpriseApi.util.invalidateTags([...ENTERPRISE_TAG_TYPES]));
      sendToast({ message: getOutcomeMessage(outcome), icon: "check" });
      onSuccess();
    }
  }, [isPolling, status, outcome, dispatch, sendToast, onSuccess]);

  return task;
};

const getOutcomeMessage = (outcome: RemoteSyncTask["outcome"]) =>
  match(outcome?.kind)
    .with("pulled", () => t`Pulled the latest changes`)
    .with("pull-skipped", () => t`Everything is up to date`)
    .with("pushed", () => t`Pushed your changes`)
    .with("push-skipped", () => t`There was nothing to push`)
    .otherwise(() => t`Sync finished`);

type RunningTaskProps = {
  progress: number;
};

const RunningTask = ({ progress }: RunningTaskProps) => {
  const [cancelTask, { isLoading, isSuccess: isCancelling }] =
    useCancelRemoteSyncCurrentTaskMutation();

  return (
    <Stack gap="lg">
      <Progress value={progress * 100} animated />
      <Group justify="flex-end">
        <Button
          loading={isLoading}
          disabled={isCancelling}
          onClick={() => cancelTask()}
        >
          {isCancelling ? t`Cancelling…` : t`Cancel`}
        </Button>
      </Group>
    </Stack>
  );
};

type FinishedTaskProps = {
  task: RemoteSyncTask;
  onClose: () => void;
};

const FinishedTask = ({ task, onClose }: FinishedTaskProps) => (
  <Stack gap="lg">
    <Text>{getErrorMessage(task)}</Text>
    {task.conflicts != null && task.conflicts.length > 0 && (
      <List>
        {task.conflicts.map((conflict) => (
          <List.Item key={conflict}>{conflict}</List.Item>
        ))}
      </List>
    )}
    <Group justify="flex-end">
      <Button variant="filled" onClick={onClose}>{t`Done`}</Button>
    </Group>
  </Stack>
);

const getErrorMessage = (task: RemoteSyncTask) =>
  task.error_message ??
  match(task)
    .with({ status: "cancelled" }, () => t`The sync was cancelled.`)
    .with(
      { status: "conflict", outcome: { kind: "remote-changed" } },
      () =>
        t`The branch changed since you opened Push. Push again to merge or overwrite its changes.`,
    )
    .with(
      { status: "conflict" },
      () => t`The same content was changed here and on the branch.`,
    )
    .otherwise(() => t`The sync failed.`);
