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

export const getDetailViewState = (state: State) => {
  return state.app.detailView;
};

export const getNavSectionOverride = (state: State) => {
  return state.app.navSection;
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
