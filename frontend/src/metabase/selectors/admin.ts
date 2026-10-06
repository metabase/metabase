import type { AdminPathKey, State } from "metabase/redux/store";

export const getAdminPaths = (state: State) => {
  return state.admin?.app?.paths ?? [];
};

export const getHasAdminPath = (state: State, key: AdminPathKey) =>
  getAdminPaths(state).some((path) => path.key === key);
