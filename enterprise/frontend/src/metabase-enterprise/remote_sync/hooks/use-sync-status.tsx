import { useSetting } from "metabase/common/hooks";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { useGetRemoteSyncCurrentTaskQuery } from "metabase-enterprise/api";

import { SyncProgressModal } from "../components/SyncProgressModal";
import {
  getErrorMessage,
  getIsError,
  getIsRunning,
  getProgress,
  getShowModal,
  getTaskType,
} from "../selectors";
import { modalDismissed } from "../sync-task-slice";

const SYNC_STATUS_POLL_INTERVAL = 2000;

export const useSyncStatus = () => {
  const isRemoteSyncEnabled = useSetting("remote-sync-enabled");
  const dispatch = useDispatch();

  const showModal = useSelector(getShowModal);
  const isRunning = useSelector(getIsRunning);
  const taskType = useSelector(getTaskType);
  const progress = useSelector(getProgress);
  const isError = useSelector(getIsError);
  const errorMessage = useSelector(getErrorMessage);

  const shouldPoll = isRunning && showModal;

  useGetRemoteSyncCurrentTaskQuery(undefined, {
    pollingInterval: shouldPoll ? SYNC_STATUS_POLL_INTERVAL : undefined,
    skipPollingIfUnfocused: true,
    skip: !isRemoteSyncEnabled || !shouldPoll,
  });

  const progressModal =
    showModal && taskType ? (
      <SyncProgressModal
        taskType={taskType}
        progress={progress}
        isError={isError}
        errorMessage={errorMessage}
        onDismiss={() => dispatch(modalDismissed())}
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
