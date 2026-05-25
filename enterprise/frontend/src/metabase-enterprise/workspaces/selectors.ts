import type { State } from "metabase/redux/store";
import { getUser, getUserIsAdmin } from "metabase/selectors/user";
import { getTokenFeature } from "metabase/setup/selectors";

export function canManageWorkspaces(state: State): boolean {
  if (getUserIsAdmin(state)) {
    return true;
  }
  const user = getUser(state);
  return user?.permissions?.can_manage_workspaces ?? false;
}

export function canManageWorkspaceInstance(state: State): boolean {
  return getUserIsAdmin(state);
}

export function getIsDevelopmentMode(state: State): boolean {
  return getTokenFeature(state, "development_mode");
}
