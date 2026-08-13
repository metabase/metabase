import type { State } from "metabase/redux/store";

export const getIsHelpReferenceOpen = (state: State) => {
  return state.admin.permissions.isHelpReferenceOpen;
};
