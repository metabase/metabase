import { dayjs } from "metabase/dayjs";
import { useDispatch, useSelector } from "metabase/redux";
import { useSetting } from "metabase/settings";
import { useGetRemoteSyncCurrentTaskQuery } from "metabase-enterprise/api";

import { SyncProgressModal } from "../components/SyncProgressModal";
import { REMOTE_SYNC_KEY, SYNC_QUIET_AFTER_MINUTES } from "../constants";
import {
  getErrorMessage,
  getHasPendingMutation,
  getInitiatedByUser,
  getIsCancelled,
  getIsError,
  getIsRunning,
  getIsSuccess,
  getLastProgressReportAt,
  getProgress,
  getShowModal,
  getStartedAt,
  getTaskOutcome,
  getTaskType,
} from "../selectors";
import { modalDismissed, taskCleared } from "../sync-task-slice";

const SYNC_STATUS_POLL_INTERVAL = 2000;

export const useSyncStatus = () => {
  const isRemoteSyncEnabled = useSetting(REMOTE_SYNC_KEY);
  const dispatch = useDispatch();

  const showModal = useSelector(getShowModal);
  const isRunning = useSelector(getIsRunning);
  const taskType = useSelector(getTaskType);
  const progress = useSelector(getProgress);
  const isError = useSelector(getIsError);
  const isCancelled = useSelector(getIsCancelled);
  const lastProgressReportAt = useSelector(getLastProgressReportAt);
  const startedAt = useSelector(getStartedAt);
  const initiatedByUser = useSelector(getInitiatedByUser);
  const errorMessage = useSelector(getErrorMessage);
  const isSuccess = useSelector(getIsSuccess);
  const outcome = useSelector(getTaskOutcome);
  const hasPendingMutation = useSelector(getHasPendingMutation);

  const minutesSinceLastUpdate = lastProgressReportAt
    ? dayjs().diff(dayjs(lastProgressReportAt), "minute")
    : null;

  const isQuiet =
    isRunning &&
    minutesSinceLastUpdate !== null &&
    minutesSinceLastUpdate >= SYNC_QUIET_AFTER_MINUTES;

  const shouldPoll = isRunning && showModal && !hasPendingMutation;

  // Always subscribed, so a fresh tab discovers a sync started elsewhere (or a stale row the backend
  // repairs on read); polling only while a task is being watched.
  useGetRemoteSyncCurrentTaskQuery(undefined, {
    pollingInterval: shouldPoll ? SYNC_STATUS_POLL_INTERVAL : undefined,
    skipPollingIfUnfocused: true,
    skip: !isRemoteSyncEnabled,
  });

  // A stopped task has nothing left to poll, so drop it instead of hiding the modal; otherwise the next
  // taskUpdated for the same stale row would reopen it.
  const onDismiss = () =>
    dispatch(isCancelled ? taskCleared() : modalDismissed());

  const progressModal =
    showModal && taskType ? (
      <SyncProgressModal
        taskType={taskType}
        progress={progress}
        isQuiet={isQuiet}
        isCancelled={isCancelled}
        minutesSinceLastUpdate={minutesSinceLastUpdate}
        startedAt={startedAt}
        initiatedByUser={initiatedByUser}
        isError={isError}
        errorMessage={errorMessage}
        isSuccess={isSuccess}
        outcome={outcome}
        onDismiss={onDismiss}
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
