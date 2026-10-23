import { getUserIsAdmin } from "metabase/current-user";
import type { State } from "metabase/redux/store";

export const getIsModerator = (state: State) => {
  return getUserIsAdmin(state);
};
