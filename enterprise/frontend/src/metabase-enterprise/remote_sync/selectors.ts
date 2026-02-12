import { createSelector } from "@reduxjs/toolkit";

import { getSetting } from "metabase/selectors/settings";
import { remoteSyncApi } from "metabase-enterprise/api";
import type { State } from "metabase-types/store";

import { initialState } from "./sync-task-slice";
import type { RemoteSyncStoreState } from "./types";

export const getRemoteSyncState = (state: RemoteSyncStoreState) =>
  state.plugins?.remoteSyncPlugin || initialState;

export const getCurrentTask = createSelector(
  getRemoteSyncState,
  (state) => state.currentTask,
);

export const getShowModal = createSelector(
  getRemoteSyncState,
  (state) => state.showModal,
);

export const getIsRunning = createSelector(
  getCurrentTask,
  (currentTask) => currentTask !== null && currentTask.ended_at === null,
);

export const getTaskType = createSelector(
  getCurrentTask,
  (currentTask) => currentTask?.sync_task_type,
);

export const getProgress = createSelector(
  getCurrentTask,
  (currentTask) => currentTask?.progress ?? 0,
);

export const getIsError = createSelector(
  getCurrentTask,
  (currentTask) => currentTask?.status === "errored",
);

export const getErrorMessage = createSelector(
  getCurrentTask,
  (currentTask) => currentTask?.error_message ?? "",
);

export const getHasPendingMutation = createSelector(
  [(state: State) => state[remoteSyncApi.reducerPath]?.mutations],
  (mutations) => {
    if (!mutations) {
      return false;
    }

    return Object.values(mutations).some(
      (mutation) => mutation?.status === "pending",
    );
  },
);

/**
 * Checks if the remote sync is enabled and in read-only mode.
 */
export const getIsRemoteSyncReadOnly = (state: State): boolean => {
  return !!(
    getSetting(state, "remote-sync-enabled") &&
    getSetting(state, "remote-sync-type") === "read-only"
  );
};

export const getSyncConflictVariant = createSelector(
  getRemoteSyncState,
  (state) => state.syncConflictVariant,
);
