import type { PayloadAction } from "@reduxjs/toolkit";
import { createSlice } from "@reduxjs/toolkit";

import {
  type CurrentTaskResponse,
  type CurrentTaskStatus,
  type SyncTaskType,
  gitSyncApi,
} from "metabase-enterprise/api";

interface RemoteSyncState {
  isSyncing: boolean;
  taskType: SyncTaskType;
  taskStatus: CurrentTaskStatus | null;
  taskId: number | null;
  progress: number | null;
  errorMessage: string | null;
  wasRunning: boolean;
  userTriggeredTaskId: number | null;
}

const initialState: RemoteSyncState = {
  isSyncing: false,
  taskType: null,
  taskStatus: null,
  taskId: null,
  progress: null,
  errorMessage: null,
  wasRunning: false,
  userTriggeredTaskId: null,
};

export const remoteSyncSlice = createSlice({
  name: "remoteSync",
  initialState,
  reducers: {
    startTask: (
      state,
      action: PayloadAction<{ taskType: SyncTaskType; taskId?: number }>,
    ) => {
      state.isSyncing = true;
      state.taskType = action.payload.taskType;
      state.taskStatus = "running";
      state.taskId = action.payload.taskId ?? null;
      state.progress = 0;
      state.errorMessage = null;
      state.wasRunning = true;
    },
    updateTaskProgress: (
      state,
      action: PayloadAction<{ progress: number; status: CurrentTaskStatus }>,
    ) => {
      state.progress = action.payload.progress;
      state.taskStatus = action.payload.status;
    },
    dismissTask: (state) => {
      state.wasRunning = false;
      state.userTriggeredTaskId = null;
      if (!state.isSyncing) {
        return initialState;
      }
    },
  },
  extraReducers: (builder) => {
    builder.addMatcher(
      gitSyncApi.endpoints.exportChanges.matchFulfilled,
      (state, { payload }) => {
        if (payload.task_id) {
          state.taskId = payload.task_id;
          state.userTriggeredTaskId = payload.task_id;
        }
      },
    );
    builder.addMatcher(
      gitSyncApi.endpoints.importFromBranch.matchFulfilled,
      (state, { payload }) => {
        if (payload.task_id) {
          state.taskId = payload.task_id;
          state.userTriggeredTaskId = payload.task_id;
        }
      },
    );
    builder.addMatcher(
      gitSyncApi.endpoints.updateGitSyncSettings.matchFulfilled,
      (state, { payload }) => {
        if (payload.task_id) {
          state.taskId = payload.task_id;
          state.userTriggeredTaskId = payload.task_id;
        }
      },
    );
    builder.addMatcher(
      gitSyncApi.endpoints.getCurrentSyncTask.matchFulfilled,
      (state, { payload }: PayloadAction<CurrentTaskResponse>) => {
        const isTerminalStatus =
          payload.status === "successful" ||
          payload.status === "cancelled" ||
          payload.status === "timed-out" ||
          payload.status === "errored";

        const wasRunningBefore = state.isSyncing;
        const previousTaskId = state.taskId;

        state.taskType = payload.sync_task_type;
        state.taskStatus = payload.status;
        state.taskId = payload.id;
        state.progress = payload.progress;
        state.errorMessage = payload.error_message;

        if (payload.ended_at === null) {
          state.isSyncing = true;
          state.wasRunning = true;
        } else if (isTerminalStatus) {
          state.isSyncing = false;
          if (wasRunningBefore && previousTaskId === payload.id) {
            state.wasRunning = true;
          }
        }
      },
    );
  },
});

export const { startTask, updateTaskProgress, dismissTask } =
  remoteSyncSlice.actions;

export const selectRemoteSync = (state: any): RemoteSyncState =>
  (state.remoteSyncPlugin as RemoteSyncState) || initialState;
