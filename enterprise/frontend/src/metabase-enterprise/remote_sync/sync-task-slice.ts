import { createSlice } from "@reduxjs/toolkit";

import type { RemoteSyncTask, RemoteSyncTaskType } from "metabase-types/api";

export interface SyncTaskState {
  currentTask: RemoteSyncTask | null;
  showModal: boolean;
}

export const initialState: SyncTaskState = {
  currentTask: null,
  showModal: false,
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
      state.currentTask = action.payload;
      if (action.payload.ended_at === null) {
        state.showModal = true;
      }
    },
    modalDismissed: (state) => {
      state.showModal = false;
    },
    taskCleared: (state) => {
      state.currentTask = null;
      state.showModal = false;
    },
  },
});

export const { taskStarted, taskUpdated, modalDismissed, taskCleared } =
  remoteSyncSlice.actions;

export const remoteSyncReducer = remoteSyncSlice.reducer;
