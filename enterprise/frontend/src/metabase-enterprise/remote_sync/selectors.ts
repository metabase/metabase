import { createSelector } from "@reduxjs/toolkit";

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
