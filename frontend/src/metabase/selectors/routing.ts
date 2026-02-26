import type { Location } from "history";

import { getCurrentLocation } from "metabase/lib/router";
import type { RouterProps } from "metabase/selectors/app";
import type { State } from "metabase-types/store";

export const isWorkspacePath = (pathname?: string | null) =>
  pathname?.includes("/data-studio/workspaces/") ?? false;

export const getLocation = (_state: State, props?: RouterProps): Location =>
  props?.location ?? (getCurrentLocation() as Location);

/**
 * Returns true if the current route is within a workspace context.
 * Workspaces are accessed via /data-studio/workspaces/:workspaceId
 */
export const getIsWorkspace = (_state: State, props?: RouterProps) => {
  const location = getLocation(_state, props);
  return isWorkspacePath(location.pathname);
};
