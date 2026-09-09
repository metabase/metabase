import { dayjs } from "metabase/dayjs";
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

  // The main app's instance is mounted app-wide, while a worktree's is mounted only by that
  // worktree's own UI. So the app-wide instance polls whichever scope the tracked task belongs to:
  // a worktree task still reaches a terminal state (closing out the modal and invalidating the
  // stale caches) when the UI that started it is no longer on screen. It still *renders* only its
  // own scope's modal, so the two instances never show the task twice, and both subscribe to the
  // same query cache entry, so this costs no extra requests.
  const tracksEveryScope = worktreeId == null;
  const trackedTask = tracksEveryScope ? currentTask : task;
  const isTrackedTaskRunning =
    trackedTask !== null && trackedTask.ended_at === null;
  const pollWorktreeId = tracksEveryScope
    ? (trackedTask?.worktree_id ?? null)
    : worktreeId;

  const shouldPoll =
    isTrackedTaskRunning && isModalShown && !hasPendingMutation;

  useGetRemoteSyncCurrentTaskQuery(
    pollWorktreeId != null ? { "worktree-id": pollWorktreeId } : undefined,
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
