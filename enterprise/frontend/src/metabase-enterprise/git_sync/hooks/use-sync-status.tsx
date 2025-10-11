import { useEffect, useState } from "react";

import { useSetting } from "metabase/common/hooks";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { useGetCurrentSyncTaskQuery } from "metabase-enterprise/api";

import { SyncProgressModal } from "../components/SyncProgressModal";
import { dismissTask, selectRemoteSync } from "../remote-sync.slice";

const SYNC_STATUS_POLL_INTERVAL = 3000;

export const useSyncStatus = () => {
  const isRemoteSyncEnabled = useSetting("remote-sync-enabled");
  const dispatch = useDispatch();
  const remoteSyncState = useSelector(selectRemoteSync);

  const [pollingInterval, setPollingInterval] = useState<number | undefined>(
    undefined,
  );

  useGetCurrentSyncTaskQuery(undefined, {
    pollingInterval,
    skipPollingIfUnfocused: true,
    skip: !isRemoteSyncEnabled,
  });

  const {
    isSyncing,
    taskType,
    taskStatus,
    progress,
    errorMessage,
    wasRunning,
  } = remoteSyncState;

  const isError = taskStatus === "errored";
  const isSuccess = taskStatus === "successful";

  useEffect(() => {
    if (isSyncing) {
      setPollingInterval(SYNC_STATUS_POLL_INTERVAL);
    } else {
      setPollingInterval(undefined);
    }
  }, [isSyncing]);

  const handleDismiss = () => {
    dispatch(dismissTask());
  };

  const showModal = (isSyncing || (!isSyncing && wasRunning)) && taskType;

  const progressModal = showModal ? (
    <SyncProgressModal
      taskType={taskType}
      progress={progress ?? 0}
      isError={isError}
      isSuccess={isSuccess}
      errorMessage={errorMessage ?? ""}
      onDismiss={handleDismiss}
    />
  ) : null;

  return {
    isRunning: isSyncing,
    taskType,
    progress: progress ?? 0,
    message: errorMessage ?? "",
    progressModal,
  };
};
