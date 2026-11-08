import { createListenerMiddleware, isFulfilled } from "@reduxjs/toolkit";

import { remoteSyncApi } from "metabase-enterprise/api";
import { tag } from "metabase-enterprise/api/tags";

const isContentMutation = (action: unknown): boolean =>
  isFulfilled(action) &&
  action.meta.arg !== null &&
  typeof action.meta.arg === "object" &&
  "type" in action.meta.arg &&
  action.meta.arg.type === "mutation";

export const remoteSyncListenerMiddleware = createListenerMiddleware();

remoteSyncListenerMiddleware.startListening({
  predicate: isContentMutation,
  effect: (_action, { dispatch }) => {
    dispatch(remoteSyncApi.util.invalidateTags([tag("remote-sync-dirty")]));
  },
});
