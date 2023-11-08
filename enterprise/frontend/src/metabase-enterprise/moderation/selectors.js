import { getUserIsAdmin } from "metabase/selectors/user";

export const getIsModerator = (state, props) => {
  return getUserIsAdmin(state, props);
};
