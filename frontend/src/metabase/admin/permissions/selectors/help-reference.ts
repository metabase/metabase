import type { State } from "metabase-types/store";

export const getIsHelpReferenceOpen = (state: State) => {
  return state.admin.permissions.isHelpReferenceOpen;
};
