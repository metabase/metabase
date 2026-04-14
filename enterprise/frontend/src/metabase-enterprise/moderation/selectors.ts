import type { State } from "metabase/redux/store";
import { getUserIsAdmin } from "metabase/selectors/user";

export const getIsModerator = (state: State) => {
  return getUserIsAdmin(state);
};
