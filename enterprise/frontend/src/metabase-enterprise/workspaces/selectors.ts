import type { State } from "metabase/redux/store";
import { getSetting } from "metabase/selectors/settings";
import { getUser, getUserIsAdmin } from "metabase/selectors/user";

export function getIsDevelopmentInstance(state: State): boolean {
  return getSetting(state, "development-instance");
}

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

export function canAccessDevelopmentInstanceSettings(state: State): boolean {
  return getUserIsAdmin(state);
}
