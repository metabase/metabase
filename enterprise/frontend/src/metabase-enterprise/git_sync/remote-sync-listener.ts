import type { ListenerEffectAPI } from "@reduxjs/toolkit";
import { createListenerMiddleware } from "@reduxjs/toolkit";

import { gitSyncApi } from "metabase-enterprise/api";

import { selectRemoteSync } from "./remote-sync.slice";

export const remoteSyncListener = createListenerMiddleware();

remoteSyncListener.startListening({
  matcher: gitSyncApi.endpoints.getCurrentSyncTask.matchFulfilled,
  effect: async (action, listenerApi: ListenerEffectAPI<any, any>) => {
    const { payload } = action;
    const { status, ended_at, id } = payload;

    const state = listenerApi.getState();
    const remoteSyncState = selectRemoteSync(state);

    const isTerminalStatus =
      status === "successful" ||
      status === "cancelled" ||
      status === "timed-out" ||
      status === "errored";

    const wasUserTriggered = remoteSyncState.userTriggeredTaskId === id;

    if (
      ended_at &&
      isTerminalStatus &&
      status === "successful" &&
      wasUserTriggered
    ) {
      listenerApi.dispatch(
        gitSyncApi.util.invalidateTags([
          { type: "collection" as const },
          { type: "collection-tree" as const },
          { type: "collection-dirty-entities" as const },
          { type: "collection-is-dirty" as const },
        ]),
      );
    }
  },
});
