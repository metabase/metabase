import { useEffect, useState } from "react";

import { useSetting } from "metabase/common/hooks";
import { useGetCurrentSyncTaskQuery } from "metabase-enterprise/api";

import { LoadingModal } from "../components/LoadingModal";

const SYNC_STATUS_POLL_INTERVAL = 3000;

export const useSyncStatus = () => {
  const isRemoteSyncEnabled = useSetting("remote-sync-enabled");
  const { data } = useGetCurrentSyncTaskQuery(undefined, {
    pollingInterval: SYNC_STATUS_POLL_INTERVAL,
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
      setWasRunning(true);
    }
  }, [isRunning]);

  const taskType = data?.sync_task_type;
  const progress = data?.progress ?? 0;
  const errorMessage = data?.error_message ?? "";

  const showModal = (isRunning || (isDone && wasRunning)) && taskType;

  const progressModal = showModal ? (
    <LoadingModal
      taskType={taskType}
      progress={progress}
      isRunning={isRunning}
      isError={isError}
      isSuccess={isSuccess}
      errorMessage={errorMessage}
      onDismiss={() => setWasRunning(false)}
    />
  ) : null;

  return {
    isIdle: !isRunning,
    taskType,
    progress,
    message: errorMessage,
    progressModal,
  };
};
