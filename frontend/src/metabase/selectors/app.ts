import { createSelector } from "@reduxjs/toolkit";

import { getUser } from "metabase/current-user";
import type { State } from "metabase/redux/store";
import type { Location } from "metabase/router";

export interface RouterProps {
  location: Location;
}

export const getErrorPage = (state: State) => {
  return state.app.errorPage;
};

export const getPageCollection = (state: State) => {
  return state.app.pageCollection;
};

export const getPageBackground = (state: State) => {
  return state.app.pageBackground;
};

export const getNavSectionOverride = (state: State) => {
  return state.app.navSection;
};

export const getNavSectionSeed = (state: State) => {
  return state.app.navSectionSeed;
};

export const getOpenNavItems = (state: State) => {
  return state.app.openNavItems;
};

export const getErrorMessage = (state: State) => {
  const errorPage = getErrorPage(state);
  return errorPage?.data?.message || errorPage?.data;
};

export const getIsDndAvailable = (state: State) => {
  return state.app.isDndAvailable;
};

export const getCustomHomePageDashboardId = createSelector(
  [getUser],
  (user) => user?.custom_homepage?.dashboard_id || null,
);

export const getIsErrorDiagnosticModalOpen = (state: State) =>
  state.app.isErrorDiagnosticsOpen;
