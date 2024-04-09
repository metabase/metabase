import { createSelector } from "@reduxjs/toolkit";

import { PLUGIN_IS_PASSWORD_USER } from "metabase/plugins";
import { getSettings } from "metabase/selectors/settings";
import { getUser } from "metabase/selectors/user";

export const getIsSsoUser = createSelector(getUser, user => {
  if (!user) {
    return false;
  }
  return !PLUGIN_IS_PASSWORD_USER.every(predicate => predicate(user));
});

export const getLocales = createSelector([getSettings], settings => {
  return settings["available-locales"];
});
