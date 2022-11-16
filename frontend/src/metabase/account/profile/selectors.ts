import { createSelector } from "reselect";

import { checkNotNull } from "metabase/core/utils/types";

import { getUser } from "metabase/selectors/user";
import { getSettings } from "metabase/selectors/settings";

import { PLUGIN_IS_PASSWORD_USER } from "metabase/plugins";

export const getIsSsoUser = createSelector(getUser, user => {
  return !PLUGIN_IS_PASSWORD_USER.every(predicate =>
    predicate(checkNotNull(user)),
  );
});

export const getLocales = createSelector([getSettings], settings => {
  return settings["available-locales"];
});
