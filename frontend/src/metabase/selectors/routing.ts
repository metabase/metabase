import { createSelector } from "@reduxjs/toolkit";

import type { State } from "metabase-types/store";

const DEFAULT_LOCATION = { pathname: "" };

export const getLocation = (state: State) =>
  state.routing?.locationBeforeTransitions ?? DEFAULT_LOCATION;

/**
 * Returns true if the current route is within a workspace context.
 * Workspaces are accessed via /data-studio/workspaces/:workspaceId
 */
export const getIsWorkspace = createSelector([getLocation], (location) => {
  return location.pathname?.includes("/data-studio/workspaces/") ?? false;
});
