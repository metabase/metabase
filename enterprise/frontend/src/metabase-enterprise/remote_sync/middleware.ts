import { createListenerMiddleware, isFulfilled } from "@reduxjs/toolkit";

import type { State } from "metabase/redux/store";
import { remoteSyncApi } from "metabase-enterprise/api";
import { tag } from "metabase-enterprise/api/tags";

import { getIsRemoteSyncVisible } from "./selectors";

const isContentMutation = (action: unknown): boolean =>
  isFulfilled(action) &&
  action.meta.arg !== null &&
  typeof action.meta.arg === "object" &&
  "type" in action.meta.arg &&
  action.meta.arg.type === "mutation";

export const remoteSyncListenerMiddleware = createListenerMiddleware<State>();

remoteSyncListenerMiddleware.startListening({
  predicate: isContentMutation,
  effect: (_action, { dispatch, getState }) => {
    if (getIsRemoteSyncVisible(getState())) {
      dispatch(remoteSyncApi.util.invalidateTags([tag("remote-sync-dirty")]));
    }
  },
});
