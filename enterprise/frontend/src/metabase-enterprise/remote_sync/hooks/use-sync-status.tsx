import dayjs from "dayjs";

import { useDispatch, useSelector } from "metabase/redux";
import { useSetting } from "metabase/settings";
import { useGetRemoteSyncCurrentTaskQuery } from "metabase-enterprise/api";
import type { WorktreeId } from "metabase-types/api";

import { SyncProgressModal } from "../components/SyncProgressModal";
import { REMOTE_SYNC_KEY } from "../constants";
import {
  getCurrentTask,
  getHasPendingMutation,
  getShowModal,
} from "../selectors";
import { modalDismissed } from "../sync-task-slice";

const SYNC_STATUS_POLL_INTERVAL = 2000;

interface UseSyncStatusOptions {
  /** Report only this worktree's sync tasks; omit (or pass null) for the main app's. */
  worktreeId?: WorktreeId | null;
}

export const useSyncStatus = ({
  worktreeId = null,
}: UseSyncStatusOptions = {}) => {
  const isRemoteSyncEnabled = useSetting(REMOTE_SYNC_KEY);
  const dispatch = useDispatch();

  const currentTask = useSelector(getCurrentTask);
  const isModalShown = useSelector(getShowModal);
  const hasPendingMutation = useSelector(getHasPendingMutation);

  // A task belonging to another scope (main app vs. some worktree) is invisible here: its progress
  // is rendered by that scope's own UI.
  const task =
    currentTask !== null && (currentTask.worktree_id ?? null) === worktreeId
      ? currentTask
      : null;

  const isRunning = task !== null && task.ended_at === null;
  const showModal = isModalShown && task !== null;
  const taskType = task?.sync_task_type;
  const progress = task?.progress ?? 0;
  const isError = task?.status === "errored";
  const isStalled = task?.status === "timed-out";
  const lastProgressReportAt = task?.last_progress_report_at ?? null;
  const errorMessage = task?.error_message ?? "";
  const isSuccess = task?.status === "successful";
  const outcome = task?.outcome ?? null;

  const minutesSinceLastUpdate = lastProgressReportAt
    ? dayjs().diff(dayjs(lastProgressReportAt), "minute")
    : null;

  const shouldPoll = isRunning && showModal && !hasPendingMutation;

  useGetRemoteSyncCurrentTaskQuery(
    worktreeId != null ? { "worktree-id": worktreeId } : undefined,
    {
      pollingInterval: shouldPoll ? SYNC_STATUS_POLL_INTERVAL : undefined,
      skipPollingIfUnfocused: true,
      skip: !isRemoteSyncEnabled || !shouldPoll,
    },
  );

  const progressModal =
    showModal && taskType ? (
      <SyncProgressModal
        taskType={taskType}
        progress={progress}
        isStalled={isStalled}
        minutesSinceLastUpdate={minutesSinceLastUpdate}
        isError={isError}
        errorMessage={errorMessage}
        isSuccess={isSuccess}
        outcome={outcome}
        worktreeId={worktreeId}
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
