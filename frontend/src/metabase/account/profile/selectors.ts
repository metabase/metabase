import { createSelector } from "reselect";
import { getUser } from "metabase/selectors/user";
import { PLUGIN_IS_PASSWORD_USER } from "metabase/plugins";
import { getSettings } from "metabase/selectors/settings";

export const getIsSsoUser = createSelector([getUser], user => {
  return !PLUGIN_IS_PASSWORD_USER.every(predicate => predicate(user));
});

export const getLocales = createSelector([getSettings], settings => {
  return settings["available-locales"];
});
