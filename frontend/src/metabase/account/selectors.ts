import { createSelector } from "@reduxjs/toolkit";

import { getUser } from "metabase/current-user";
import { PLUGIN_IS_PASSWORD_USER } from "metabase/plugins";

export const getIsSsoUser = createSelector(getUser, (user) => {
  if (!user) {
    return false;
  }
  return !PLUGIN_IS_PASSWORD_USER.every((predicate) => predicate(user));
});
