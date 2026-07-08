import { createSlice } from "@reduxjs/toolkit";

import type {
  RemoteSyncConflictVariant,
  RemoteSyncTask,
  RemoteSyncTaskType,
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
      action: { payload: { taskType: RemoteSyncTaskType } },
    ) => {
      state.currentTask = {
        id: 0,
        sync_task_type: action.payload.taskType,
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
      if (
        !state.currentTask ||
        // status for old task can come in when a new task has been already started
        state.currentTask.sync_task_type === action.payload.sync_task_type
      ) {
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
