import { createSelector } from "@reduxjs/toolkit";

import { getSettings } from "metabase/settings";

export const getLocales = createSelector([getSettings], (settings) => {
  return settings["available-locales"];
});
