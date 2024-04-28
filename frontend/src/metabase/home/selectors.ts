import { createSelector } from "@reduxjs/toolkit";

import { getSetting } from "metabase/selectors/settings";
import { getUser } from "metabase/selectors/user";
import type { State } from "metabase-types/store";

export const getIsXrayEnabled = (state: State) => {
  return getSetting(state, "enable-xrays");
};

export const getIsMetabotEnabled = (state: State) => {
  return getSetting(state, "is-metabot-enabled");
};

export const getHasMetabotLogo = (state: State) => {
  return getSetting(state, "show-metabot");
};

export const getCustomHomePageDashboardId = createSelector(
  [getUser],
  user => user?.custom_homepage?.dashboard_id || null,
);

export const getHasDismissedCustomHomePageToast = (state: State) => {
  return getSetting(state, "dismissed-custom-dashboard-toast");
};
