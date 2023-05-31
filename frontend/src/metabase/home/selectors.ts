import { createSelector } from "@reduxjs/toolkit";
import { getSetting } from "metabase/selectors/settings";
import { State } from "metabase-types/store";
import { getUser } from "metabase/selectors/user";

export const getIsXrayEnabled = (state: State) => {
  return getSetting(state, "enable-xrays");
};

export const getIsMetabotEnabled = (state: State) => {
  return getSetting(state, "is-metabot-enabled");
};

export const getCustomHomePageDashboardId = createSelector(
  [getUser],
  user => user?.custom_homepage?.dashboard_id || null,
);
