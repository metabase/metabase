import { useEffect, useState } from "react";
import { match } from "ts-pattern";
import { c, t } from "ttag";

import { useToast } from "metabase/common/hooks";
import { dayjs } from "metabase/dayjs";
import { useDispatch } from "metabase/redux";
import {
  Button,
  FocusTrap,
  Group,
  List,
  Modal,
  Progress,
  Stack,
  Text,
} from "metabase/ui";
import { getUserName } from "metabase/utils/user";
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

export function SyncTaskModal({ title, taskId, onClose }: SyncTaskModalProps) {
  return (
    <Modal
      opened={taskId != null}
      title={title}
      closeOnClickOutside={false}
      closeOnEscape={false}
      withCloseButton={false}
      onClose={onClose}
    >
      <FocusTrap.InitialFocus />
      {taskId != null && (
        <SyncTaskModalBody taskId={taskId} onClose={onClose} />
      )}
    </Modal>
  );
}

type SyncTaskModalBodyProps = {
  taskId: RemoteSyncTaskId;
  onClose: () => void;
};

function SyncTaskModalBody({ taskId, onClose }: SyncTaskModalBodyProps) {
  const task = useSyncTask(taskId, onClose);

  if (
    task == null ||
    task.status === "running" ||
    task.status === "successful"
  ) {
    return <RunningTask task={task} />;
  }

  return <FinishedTask task={task} onClose={onClose} />;
}

function useSyncTask(
  taskId: RemoteSyncTaskId,
  onSuccess: () => void,
): RemoteSyncTask | undefined {
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
}

function getOutcomeMessage(outcome: RemoteSyncTask["outcome"]) {
  return match(outcome?.kind)
    .with("pulled", () => t`Pulled the latest changes`)
    .with("pull-skipped", () => t`Everything is up to date`)
    .with("pushed", () => t`Pushed your changes`)
    .with("push-skipped", () => t`There was nothing to push`)
    .otherwise(() => t`Sync finished`);
}

type RunningTaskProps = {
  task: RemoteSyncTask | undefined;
};

function RunningTask({ task }: RunningTaskProps) {
  const [cancelTask, { isLoading, isSuccess: isCancelling }] =
    useCancelRemoteSyncCurrentTaskMutation();

  return (
    <Stack gap="lg">
      <Stack gap="sm">
        {task != null && (
          <Text ta="center" c="text-secondary">
            {task.sync_task_type === "export"
              ? t`Exporting content…`
              : t`Importing content…`}
          </Text>
        )}
        <Progress value={(task?.progress ?? 0) * 100} animated />
      </Stack>
      {task != null && (
        <Text size="sm" c="text-secondary">
          {getStartedBy(task)}
        </Text>
      )}
      <Text size="sm">{t`Please wait until this finishes before editing content.`}</Text>
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
}

type FinishedTaskProps = {
  task: RemoteSyncTask;
  onClose: () => void;
};

function FinishedTask({ task, onClose }: FinishedTaskProps) {
  return (
    <Stack gap="lg">
      <Text>{getErrorMessage(task)}</Text>
      {task.status === "cancelled" && (
        <Text size="sm" c="text-secondary">
          {getStoppedAt(task)}
        </Text>
      )}
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
}

function getErrorMessage(task: RemoteSyncTask) {
  return (
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
      .otherwise(() => t`The sync failed.`)
  );
}

function getStartedBy(task: RemoteSyncTask) {
  const time = dayjs(task.started_at).format("LT");
  return task.initiated_by_user != null
    ? c("{0} is a person's name, {1} is a time of day")
        .t`Started by ${getUserName(task.initiated_by_user)} at ${time}`
    : c("{0} is a time of day").t`Started at ${time}`;
}

function getStoppedAt(task: RemoteSyncTask) {
  const percent = Math.round((task.progress ?? 0) * 100);
  const startedBy = getStartedBy(task);
  return c("{0} is a percentage, {1} says who started the sync and when")
    .t`Stopped at ${percent}% · ${startedBy}`;
}
