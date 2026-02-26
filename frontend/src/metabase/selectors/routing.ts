import { createSelector } from "@reduxjs/toolkit";
import type { Location } from "history";

import type { RouterProps } from "metabase/selectors/app";
import type { State } from "metabase-types/store";

const DEFAULT_LOCATION: Location = {
  pathname: "",
  search: "",
  hash: "",
  state: undefined,
  action: "POP",
  key: "",
  // react-router v3 adds a query object; keep it optional but present
  // in the default to satisfy the Location type.
  query: {},
} as Location;

export const isWorkspacePath = (pathname?: string | null) =>
  pathname?.includes("/data-studio/workspaces/") ?? false;

export const getLocation = (state: State, props?: RouterProps): Location =>
  props?.location ?? DEFAULT_LOCATION;

/**
 * Returns true if the current route is within a workspace context.
 * Workspaces are accessed via /data-studio/workspaces/:workspaceId
 */
export const getIsWorkspace = createSelector([getLocation], (location) => {
  return isWorkspacePath(location.pathname);
});
