import type { Selector } from "@reduxjs/toolkit";
import { createSelector } from "@reduxjs/toolkit";
import type { Location } from "history";

import {
  getDashboard,
  getDashboardId,
  getIsEditing as getIsEditingDashboard,
} from "metabase/dashboard/selectors";
import { getIsEmbeddingIframe } from "metabase/embedding-sdk/config";
import { PLUGIN_DOCUMENTS } from "metabase/plugins";
import {
  getIsSavedQuestionChanged,
  getQuestion,
} from "metabase/query_builder/selectors";
import { getEmbedOptions } from "metabase/selectors/embed";
import { getUser } from "metabase/selectors/user";
import type { State } from "metabase-types/store";

import { getSetting } from "./settings";

export interface RouterProps {
  location: Location;
}

const PATHS_WITHOUT_NAVBAR = [
  /^\/setup/,
  /^\/auth/,
  /\/model\/.*\/query/,
  /\/model\/.*\/columns/,
  /\/model\/.*\/metadata/,
  /\/model\/query/,
  /\/model\/columns/,
  /\/model\/metadata/,
  /\/metric\/.*\/query/,
  /\/metric\/.*\/metadata/,
  /\/metric\/query/,
  /\/metric\/metadata/,
  /\/transform\/new\/.*\/query/,
];

const PATHS_WITH_COLLECTION_BREADCRUMBS = [
  /\/question\//,
  /\/model\//,
  /\/metric\//,
  /\/dashboard\//,
  /\/document\//,
];
const PATHS_WITH_QUESTION_LINEAGE = [/\/question/, /\/model/];

export const getRouterPath = (state: State, props: RouterProps) => {
  return props?.location?.pathname ?? window.location.pathname;
};

export const getRouterHash = (state: State, props: RouterProps) => {
  return props?.location?.hash ?? window.location.hash;
};

export const getIsAdminApp = createSelector([getRouterPath], (path) => {
  return path.startsWith("/admin/");
});

export const getIsCollectionPathVisible = createSelector(
  [
    getQuestion,
    getDashboard,
    (state) => PLUGIN_DOCUMENTS.getCurrentDocument(state),
    getRouterPath,
    getEmbedOptions,
  ],
  (question, dashboard, document, path, embedOptions) => {
    if (getIsEmbeddingIframe() && !embedOptions.breadcrumbs) {
      return false;
    }

    const isModelDetail = /\/model\/.*\/detail\/.*/.test(path);
    if (isModelDetail) {
      return true;
    }

    return (
      ((question != null && question.isSaved()) ||
        dashboard != null ||
        document !== null) &&
      PATHS_WITH_COLLECTION_BREADCRUMBS.some((pattern) => pattern.test(path))
    );
  },
);

export const getIsQuestionLineageVisible = createSelector(
  [getIsSavedQuestionChanged, getRouterPath],
  (isSavedQuestionChanged, path) =>
    isSavedQuestionChanged &&
    PATHS_WITH_QUESTION_LINEAGE.some((pattern) => pattern.test(path)),
);

export const getIsNavBarEnabled = createSelector(
  [getUser, getRouterPath, getIsEditingDashboard, getEmbedOptions],
  (currentUser, path, isEditingDashboard, embedOptions) => {
    if (!currentUser || isEditingDashboard) {
      return false;
    }
    if (getIsEmbeddingIframe() && !embedOptions.side_nav) {
      return false;
    }

    return !PATHS_WITHOUT_NAVBAR.some((pattern) => pattern.test(path));
  },
);

const getIsEmbeddedAppBarVisible = createSelector(
  [
    getEmbedOptions,
    getIsQuestionLineageVisible,
    getIsCollectionPathVisible,
    getIsNavBarEnabled,
  ],
  (
    embedOptions,
    isQuestionLineageVisible,
    isCollectionPathVisible,
    isNavBarEnabled,
  ) => {
    const anyEmbeddedAppBarElementVisible =
      isNavBarEnabled ||
      embedOptions.search ||
      embedOptions.new_button ||
      embedOptions.logo ||
      isQuestionLineageVisible ||
      isCollectionPathVisible;
    return embedOptions.top_nav && anyEmbeddedAppBarElementVisible;
  },
);

export const getIsAppBarVisible = createSelector(
  [
    getUser,
    getRouterPath,
    getRouterHash,
    getIsAdminApp,
    getIsEditingDashboard,
    getIsEmbeddedAppBarVisible,
  ],
  (
    currentUser,
    path,
    hash,
    isAdminApp,
    isEditingDashboard,
    isEmbeddedAppBarVisible,
  ) => {
    const isFullscreen = hash.includes("fullscreen");

    if (
      !currentUser ||
      (getIsEmbeddingIframe() && !isEmbeddedAppBarVisible) ||
      isAdminApp ||
      isEditingDashboard ||
      isFullscreen
    ) {
      return false;
    }
    return !PATHS_WITHOUT_NAVBAR.some((pattern) => pattern.test(path));
  },
);

export const getIsLogoVisible = createSelector(
  [getEmbedOptions, () => getIsEmbeddingIframe()],
  (embedOptions, isEmbeddingIframe) => {
    return !isEmbeddingIframe || embedOptions.logo;
  },
);

export const getIsSearchVisible = createSelector(
  [getEmbedOptions, () => getIsEmbeddingIframe()],
  (embedOptions, isEmbeddingIframe) => {
    return !isEmbeddingIframe || embedOptions.search;
  },
);

export const getIsNewButtonVisible = createSelector(
  [getEmbedOptions, () => getIsEmbeddingIframe()],
  (embedOptions, isEmbeddingIframe) => {
    return !isEmbeddingIframe || embedOptions.new_button;
  },
);

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

export const getCollectionId = createSelector(
  [
    getQuestion,
    getDashboard,
    getDashboardId,
    (state) => PLUGIN_DOCUMENTS.getCurrentDocument(state),
    getDetailViewState,
  ],
  (question, dashboard, dashboardId, document, detailView) => {
    if (detailView) {
      return detailView.collectionId;
    }

    if (document) {
      return document.collection_id;
    }

    if (dashboardId) {
      return dashboard?.collection_id;
    }

    return question?.collectionId();
  },
);

export const getIsNavbarOpen: Selector<State, boolean> = createSelector(
  [
    getEmbedOptions,
    getIsAppBarVisible,
    (state: State) => state.app.isNavbarOpen,
  ],
  (embedOptions, isAppBarVisible, isNavbarOpen) => {
    // in an embedded instance, when the app bar is hidden, but the nav bar is not
    // we need to force the sidebar to be open or else it will be totally inaccessible
    if (
      getIsEmbeddingIframe() &&
      embedOptions.side_nav === true &&
      !isAppBarVisible
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
