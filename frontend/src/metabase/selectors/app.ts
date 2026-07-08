import type { Selector } from "@reduxjs/toolkit";
import { createSelector } from "@reduxjs/toolkit";
import type { Location } from "history";

import type { State } from "metabase/redux/store";
import {
  getEmbedOptions,
  getIsEmbeddingIframe,
} from "metabase/selectors/embed";
import { getUser } from "metabase/selectors/user";

import { getSetting } from "./settings";

export interface RouterProps {
  location: Location;
}

export const getErrorPage = (state: State) => {
  return state.app.errorPage;
};

export const getDetailViewState = (state: State) => {
  return state.app.detailView;
};

export const getErrorMessage = (state: State) => {
  const errorPage = getErrorPage(state);
  return errorPage?.data?.message || errorPage?.data;
};

export const getIsNavbarOpen: Selector<State, boolean> = createSelector(
  [
    getIsEmbeddingIframe,
    getEmbedOptions,
    (_state: State) => window.location.hash,
    (state: State) => state.app.isNavbarOpen,
  ],
  (isEmbeddingIframe, embedOptions, locationHash, isNavbarOpen) => {
    // In an embedded instance, when the app bar is hidden but the side nav is
    // enabled, force the sidebar open or it would be totally inaccessible.
    //
    // The app bar is hidden exactly when `top_nav` is off or we're in
    // fullscreen. The other factors in the app-tier getIsAppBarVisible only
    // matter when the nav bar isn't rendered anyway.
    const isFullscreen = locationHash.includes("fullscreen");
    if (
      isEmbeddingIframe &&
      embedOptions.side_nav === true &&
      (!embedOptions.top_nav || isFullscreen)
    ) {
      return true;
    }

    return isNavbarOpen;
  },
);

export const getIsDndAvailable = (state: State) => {
  return state.app.isDndAvailable;
};

export const getCustomHomePageDashboardId = createSelector(
  [getUser],
  (user) => user?.custom_homepage?.dashboard_id || null,
);

export const getHasDismissedCustomHomePageToast = (state: State) => {
  return getSetting(state, "dismissed-custom-dashboard-toast");
};

export const getIsErrorDiagnosticModalOpen = (state: State) =>
  state.app.isErrorDiagnosticsOpen;
