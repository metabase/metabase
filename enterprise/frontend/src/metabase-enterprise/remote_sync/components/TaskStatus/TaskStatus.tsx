import { useEffect, useRef, useState } from "react";
import { match } from "ts-pattern";
import { t } from "ttag";

import { Api } from "metabase/api";
import { useToast } from "metabase/common/hooks";
import { useDispatch } from "metabase/redux";
import { useSetting } from "metabase/settings";
import { Button, Group, List, Modal, Progress, Stack, Text } from "metabase/ui";
import {
  EnterpriseApi,
  useCancelRemoteSyncCurrentTaskMutation,
  useGetRemoteSyncCurrentTaskQuery,
} from "metabase-enterprise/api";
import type { RemoteSyncOutcome, RemoteSyncTask } from "metabase-types/api";

import { TASK_POLLING_INTERVAL_MS } from "../../constants";

export const TaskStatus = () => {
  const isEnabled = useSetting("remote-sync-enabled");

  if (!isEnabled) {
    return null;
  }

  return <TaskStatusModal />;
};

const getOutcomeMessage = (outcome: RemoteSyncOutcome | null | undefined) =>
  match(outcome?.kind)
    .with("pulled", () => t`Pulled the latest changes`)
    .with("pull-skipped", () => t`Everything is up to date`)
    .with("pushed", () => t`Pushed your changes`)
    .with("push-skipped", () => t`There was nothing to push`)
    .otherwise(() => t`Sync finished`);

const TaskStatusModal = () => {
  const [pollingInterval, setPollingInterval] = useState(0);
  const { data: task } = useGetRemoteSyncCurrentTaskQuery(undefined, {
    pollingInterval,
  });
  const [failedTask, setFailedTask] = useState<RemoteSyncTask | null>(null);
  const handledTaskId = useRef<number | null | undefined>(undefined);
  const dispatch = useDispatch();
  const [sendToast] = useToast();

  useEffect(() => {
    if (task === undefined) {
      return;
    }
    if (task?.status === "running") {
      handledTaskId.current ??= null;
      setPollingInterval(TASK_POLLING_INTERVAL_MS);
      return;
    }
    setPollingInterval(0);
    const taskId = task?.id ?? null;
    const isFirstLoad = handledTaskId.current === undefined;
    const isHandled = handledTaskId.current === taskId;
    handledTaskId.current = taskId;
    if (!task || isFirstLoad || isHandled) {
      return;
    }
    if (task.status === "successful") {
      sendToast({ message: getOutcomeMessage(task.outcome), icon: "check" });
      if (task.sync_task_type === "import") {
        dispatch(Api.util.resetApiState());
      } else {
        dispatch(
          EnterpriseApi.util.invalidateTags([
            "session-properties",
            "remote-sync-dirty",
          ]),
        );
      }
    } else {
      setFailedTask(task);
    }
  }, [task, dispatch, sendToast]);

  if (task?.status === "running") {
    return <RunningTaskModal task={task} />;
  }

  return (
    <FailedTaskModal task={failedTask} onClose={() => setFailedTask(null)} />
  );
};

type RunningTaskModalProps = {
  task: RemoteSyncTask;
};

const RunningTaskModal = ({ task }: RunningTaskModalProps) => {
  const [cancelTask, { isLoading }] = useCancelRemoteSyncCurrentTaskMutation();
  const title =
    task.sync_task_type === "import" ? t`Pulling changes` : t`Pushing changes`;

  return (
    <Modal
      opened
      title={title}
      withCloseButton={false}
      onClose={() => undefined}
    >
      <Stack gap="lg">
        <Progress value={(task.progress ?? 0) * 100} animated />
        <Group justify="flex-end">
          <Button loading={isLoading} onClick={() => cancelTask()}>
            {t`Cancel`}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
};

type FailedTaskModalProps = {
  task: RemoteSyncTask | null;
  onClose: () => void;
};

const FailedTaskModal = ({ task, onClose }: FailedTaskModalProps) => (
  <Modal opened={task !== null} title={t`Sync failed`} onClose={onClose}>
    {task && <FailedTaskModalBody task={task} onClose={onClose} />}
  </Modal>
);

type FailedTaskModalBodyProps = {
  task: RemoteSyncTask;
  onClose: () => void;
};

const FailedTaskModalBody = ({ task, onClose }: FailedTaskModalBodyProps) => (
  <Stack gap="lg">
    <Text>
      {task.error_message ??
        (task.status === "cancelled"
          ? t`The sync was cancelled.`
          : t`The same content was changed here and on the branch.`)}
    </Text>
    {task.conflicts && task.conflicts.length > 0 && (
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
