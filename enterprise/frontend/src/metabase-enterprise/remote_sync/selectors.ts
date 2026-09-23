import { createSelector } from "@reduxjs/toolkit";

import { getUser } from "metabase/current-user";
import type { State } from "metabase/redux/store";
import { getSetting } from "metabase/settings";
import { remoteSyncApi } from "metabase-enterprise/api";

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

export const getIsCancelled = createSelector(
  getCurrentTask,
  (currentTask) => currentTask?.status === "cancelled",
);

export const getLastProgressReportAt = createSelector(
  getCurrentTask,
  (currentTask) => currentTask?.last_progress_report_at ?? null,
);

export const getStartedAt = createSelector(
  getCurrentTask,
  (currentTask) => currentTask?.started_at ?? null,
);

export const getInitiatedByUser = createSelector(
  getCurrentTask,
  (currentTask) => currentTask?.initiated_by_user ?? null,
);

export const getIsSuccess = createSelector(
  getCurrentTask,
  (currentTask) => currentTask?.status === "successful",
);

export const getErrorMessage = createSelector(
  getCurrentTask,
  (currentTask) => currentTask?.error_message ?? "",
);

export const getTaskOutcome = createSelector(
  getCurrentTask,
  (currentTask) => currentTask?.outcome ?? null,
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
 * Whether content the instance syncs may not be edited: it is in read-only mode and the user is not working in a
 * worktree, which is where a read-only instance's content is authored.
 */
export const getIsRemoteSyncReadOnly = (state: State): boolean => {
  return (
    (getSetting(state, "remote-sync-enabled") ?? false) &&
    getSetting(state, "remote-sync-type") === "read-only" &&
    getUser(state)?.worktree_id == null
  );
};

export const getSyncConflictVariant = createSelector(
  getRemoteSyncState,
  (state) => state.syncConflictVariant,
);
