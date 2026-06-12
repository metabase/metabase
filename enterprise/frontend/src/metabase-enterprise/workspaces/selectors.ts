import type { State } from "metabase/redux/store";
import { getUserIsAdmin } from "metabase/selectors/user";

export function canManageWorkspaces(state: State): boolean {
  return getUserIsAdmin(state);
}
