import type { State } from "metabase/redux/store";

export const getAdminPaths = (state: State) => {
  return state.admin?.app?.paths ?? [];
};
