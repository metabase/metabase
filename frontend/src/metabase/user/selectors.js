import { createSelector } from "reselect";

// our master selector which combines all of our partial selectors above
export const selectors = createSelector(
  [
    state => state.user.tab,
    state => state.user.updatePasswordResult,
    state => state.user.updateUserResult,
  ],
  (tab, updatePasswordResult, updateUserResult) => ({
    tab,
    updatePasswordResult,
    updateUserResult,
  }),
);
