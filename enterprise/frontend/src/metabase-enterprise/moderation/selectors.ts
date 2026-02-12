import { getUserIsAdmin } from "metabase/selectors/user";
import type { State } from "metabase-types/store";

export const getIsModerator = (state: State) => {
  return getUserIsAdmin(state);
};
