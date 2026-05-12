import type { State } from "metabase/redux/store";
import { getSetting } from "metabase/selectors/settings";
import { getUser, getUserIsAdmin } from "metabase/selectors/user";

export const canManageWorkspaces = (state: State): boolean => {
  if (getUserIsAdmin(state)) {
    return true;
  }
  const user = getUser(state);
  return user?.permissions?.can_manage_workspaces ?? false;
};

export const hasActiveWorkspace = (state: State): boolean =>
  getSetting(state, "has-active-workspace") ?? false;
