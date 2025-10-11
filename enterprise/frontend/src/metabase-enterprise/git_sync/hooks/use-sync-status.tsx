import { useEffect, useState } from "react";

import { useSetting } from "metabase/common/hooks";
import { useGetCurrentSyncTaskQuery } from "metabase-enterprise/api";

import { SyncProgressModal } from "../components/SyncProgressModal";

const SYNC_STATUS_POLL_INTERVAL = 3000;

export const useSyncStatus = () => {
  const isRemoteSyncEnabled = useSetting("remote-sync-enabled");
  const [pollingInterval, setPollingInterval] = useState<number | undefined>(
    undefined,
  );

  const { data } = useGetCurrentSyncTaskQuery(undefined, {
    pollingInterval,
    skipPollingIfUnfocused: true,
    skip: !isRemoteSyncEnabled,
  });
  const [wasRunning, setWasRunning] = useState(false);

  const isRunning = data && data.ended_at === null;
  const isDone = data && data.ended_at !== null;
  const isError = data?.status === "errored";
  const isSuccess = data?.status === "successful";

  useEffect(() => {
    if (isRunning) {
      setPollingInterval(SYNC_STATUS_POLL_INTERVAL);
      setWasRunning(true);
    } else {
      setPollingInterval(undefined);
    }
  }, [isRunning]);

  const taskType = data?.sync_task_type;
  const progress = data?.progress ?? 0;
  const errorMessage = data?.error_message ?? "";

  const showModal = (isRunning || (isDone && wasRunning)) && taskType;

  const progressModal = showModal ? (
    <SyncProgressModal
      taskType={taskType}
      progress={progress}
      isError={isError}
      isSuccess={isSuccess}
      errorMessage={errorMessage}
      onDismiss={() => setWasRunning(false)}
    />
  ) : null;

  return {
    isIdle: !isRunning,
    isRunning,
    taskType,
    progress,
    message: errorMessage,
    progressModal,
  };
};
