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
      state.currentTask = {
        id: 0,
        sync_task_type: action.payload.taskType,
        worktree_id: action.payload.worktreeId ?? null,
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
        (state.currentTask.worktree_id ?? null) ===
          (action.payload.worktree_id ?? null);
      if (!state.currentTask || matchesCurrentTask) {
        state.currentTask = action.payload;
        if (action.payload.ended_at === null) {
          state.showModal = true;
        }
      }
    },
    modalDismissed: (state) => {
      state.showModal = false;
    },
    taskCleared: (state) => {
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
  modalDismissed,
  taskCleared,
  syncConflictVariantUpdated,
} = remoteSyncSlice.actions;

export const remoteSyncReducer = remoteSyncSlice.reducer;
