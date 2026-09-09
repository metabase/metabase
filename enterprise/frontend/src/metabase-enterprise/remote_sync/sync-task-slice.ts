import { createSlice } from "@reduxjs/toolkit";

import type {
  RemoteSyncConflictVariant,
  RemoteSyncTask,
  RemoteSyncTaskType,
  WorktreeId,
} from "metabase-types/api";

export interface SyncTaskState {
  currentTask: RemoteSyncTask | null;
  showModal: boolean;
  syncConflictVariant: RemoteSyncConflictVariant | null;
}

export const initialState: SyncTaskState = {
  currentTask: null,
  showModal: false,
  syncConflictVariant: null,
};

/** The scope a task runs in: a worktree, or (null) the main app. */
interface TaskScope {
  worktreeId: WorktreeId | null;
}

function isRunning(task: RemoteSyncTask | null): task is RemoteSyncTask {
  return task !== null && task.ended_at === null;
}

function isInScope(task: RemoteSyncTask, { worktreeId }: TaskScope) {
  return (task.worktree_id ?? null) === worktreeId;
}

export const remoteSyncSlice = createSlice({
  name: "remoteSyncPlugin",
  initialState,
  reducers: {
    taskStarted: (
      state,
      action: {
        payload: {
          taskType: RemoteSyncTaskType;
          worktreeId?: WorktreeId | null;
        };
      },
    ) => {
      const scope = { worktreeId: action.payload.worktreeId ?? null };
      // The backend runs one sync task at a time instance-wide, so a start while another scope's
      // task is running is going to be rejected: keep tracking the task that is actually running,
      // or its progress (and the cache invalidation when it ends) would be lost.
      if (
        isRunning(state.currentTask) &&
        !isInScope(state.currentTask, scope)
      ) {
        return;
      }
      state.currentTask = {
        id: 0,
        sync_task_type: action.payload.taskType,
        worktree_id: scope.worktreeId,
        status: "running",
        progress: 0,
        started_at: new Date().toISOString(),
        ended_at: null,
        last_progress_report_at: null,
        error_message: null,
        initiated_by: 0,
      };
      state.showModal = true;
    },
    taskUpdated: (state, action: { payload: RemoteSyncTask }) => {
      // status for an old task can come in when a new task has been already started, and the main
      // app and a worktree can poll their tasks concurrently — only accept updates for the task
      // this slice is tracking
      const matchesCurrentTask =
        state.currentTask !== null &&
        state.currentTask.sync_task_type === action.payload.sync_task_type &&
        isInScope(action.payload, {
          worktreeId: state.currentTask.worktree_id ?? null,
        });
      if (!state.currentTask || matchesCurrentTask) {
        state.currentTask = action.payload;
        if (action.payload.ended_at === null) {
          state.showModal = true;
        }
      }
    },
    /**
     * Track a task found running on the server that this client did not start (after a reload, or
     * started from another session), unless a running task is already being tracked.
     */
    runningTaskAdopted: (state, action: { payload: RemoteSyncTask }) => {
      if (!isRunning(action.payload) || isRunning(state.currentTask)) {
        return;
      }
      state.currentTask = action.payload;
      state.showModal = true;
    },
    modalDismissed: (state) => {
      state.showModal = false;
    },
    /** Stop tracking the current task, but only if it belongs to the given scope. */
    taskCleared: (state, action: { payload: TaskScope }) => {
      if (
        state.currentTask === null ||
        !isInScope(state.currentTask, action.payload)
      ) {
        return;
      }
      state.currentTask = null;
      state.showModal = false;
    },
    syncConflictVariantUpdated: (
      state,
      action: { payload: RemoteSyncConflictVariant | null },
    ) => {
      state.syncConflictVariant = action.payload;
    },
  },
});

export const {
  taskStarted,
  taskUpdated,
  runningTaskAdopted,
  modalDismissed,
  taskCleared,
  syncConflictVariantUpdated,
} = remoteSyncSlice.actions;

export const remoteSyncReducer = remoteSyncSlice.reducer;
