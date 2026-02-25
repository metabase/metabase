import { createSelector } from "@reduxjs/toolkit";

import type { RouterProps } from "metabase/selectors/app";
import type { State } from "metabase-types/store";

const DEFAULT_LOCATION = { pathname: "" };

export const isWorkspacePath = (pathname?: string | null) =>
  pathname?.includes("/data-studio/workspaces/") ?? false;

export const getLocation = (state: State, props: RouterProps) =>
  props?.location ?? DEFAULT_LOCATION;

/**
 * Returns true if the current route is within a workspace context.
 * Workspaces are accessed via /data-studio/workspaces/:workspaceId
 */
export const getIsWorkspace = createSelector([getLocation], (location) => {
  return isWorkspacePath(location.pathname);
});
