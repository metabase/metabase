import { getUser, getUserIsAdmin } from "metabase/selectors/user";
import type { State } from "metabase-types/store";

export const canAccessTransforms = (state: State): boolean => {
  if (getUserIsAdmin(state)) {
    return true;
  }
  const user = getUser(state);
  return user?.permissions?.can_access_transforms ?? false;
};
