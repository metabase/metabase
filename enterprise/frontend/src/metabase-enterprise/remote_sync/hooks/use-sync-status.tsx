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
  getIsAnyTaskRunning,
  getShowModal,
} from "../selectors";
import { modalDismissed } from "../sync-task-slice";

const SYNC_STATUS_POLL_INTERVAL = 2000;

interface UseSyncStatusOptions {
  /** Report only this worktree's sync tasks; omit (or pass null) for the main app's. */
  worktreeId?: WorktreeId | null;
}

/**
 * The sync task state as seen from one scope (the main app or a worktree).
 *
 * The main app's instance is mounted app-wide (by StatusListing), while a worktree's is mounted only
 * by that worktree's own UI, which the user can leave while its task runs. So the app-wide instance
 * tracks whichever scope the current task belongs to: it polls the task to its terminal state (which
 * invalidates the stale caches) and renders the progress modal for it, so the modal survives leaving
 * the UI that started the task. A worktree instance reports only its own scope's task and renders no
 * modal, so a task is never shown twice. Both subscribe to the same query cache entry, so tracking
 * from two instances costs no extra requests.
 */
export const useSyncStatus = ({
  worktreeId = null,
}: UseSyncStatusOptions = {}) => {
  const isRemoteSyncEnabled = useSetting(REMOTE_SYNC_KEY);
  const dispatch = useDispatch();

  const currentTask = useSelector(getCurrentTask);
  const isAnyTaskRunning = useSelector(getIsAnyTaskRunning);
  const isModalShown = useSelector(getShowModal);
  const hasPendingMutation = useSelector(getHasPendingMutation);

  const isAppWide = worktreeId === null;
  const ownTask =
    currentTask !== null && (currentTask.worktree_id ?? null) === worktreeId
      ? currentTask
      : null;
  const trackedTask = isAppWide ? currentTask : ownTask;

  const isRunning = ownTask !== null && ownTask.ended_at === null;
  const isTrackedTaskRunning =
    trackedTask !== null && trackedTask.ended_at === null;
  const shouldPoll =
    isTrackedTaskRunning && isModalShown && !hasPendingMutation;
  const pollWorktreeId = trackedTask?.worktree_id ?? null;

  useGetRemoteSyncCurrentTaskQuery(
    pollWorktreeId !== null ? { "worktree-id": pollWorktreeId } : undefined,
    {
      pollingInterval: shouldPoll ? SYNC_STATUS_POLL_INTERVAL : undefined,
      skipPollingIfUnfocused: true,
      skip: !isRemoteSyncEnabled || !shouldPoll,
    },
  );

  const lastProgressReportAt = trackedTask?.last_progress_report_at ?? null;
  const minutesSinceLastUpdate = lastProgressReportAt
    ? dayjs().diff(dayjs(lastProgressReportAt), "minute")
    : null;

  const progressModal =
    isAppWide && isModalShown && trackedTask !== null ? (
      <SyncProgressModal
        taskType={trackedTask.sync_task_type}
        progress={trackedTask.progress ?? 0}
        isStalled={trackedTask.status === "timed-out"}
        minutesSinceLastUpdate={minutesSinceLastUpdate}
        isError={trackedTask.status === "errored"}
        errorMessage={trackedTask.error_message ?? ""}
        isSuccess={trackedTask.status === "successful"}
        outcome={trackedTask.outcome ?? null}
        worktreeId={trackedTask.worktree_id ?? null}
        onDismiss={() => dispatch(modalDismissed())}
      />
    ) : null;

  return {
    isIdle: !isRunning,
    /** A task of this scope is running. */
    isRunning,
    /**
     * A task is running in any scope. The backend runs one sync task at a time instance-wide, so
     * no scope can start another while this is true.
     */
    isAnyTaskRunning,
    taskType: ownTask?.sync_task_type,
    progress: ownTask?.progress ?? 0,
    message: ownTask?.error_message ?? "",
    /** Rendered by the app-wide instance only, for whichever scope's task is tracked. */
    progressModal,
  };
};
