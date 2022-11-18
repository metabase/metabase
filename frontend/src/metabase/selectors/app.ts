import { createSelector } from "reselect";
import type { Location } from "history";

import * as Urls from "metabase/lib/urls";

import { getUser } from "metabase/selectors/user";
import {
  getIsEditing as getIsEditingDashboard,
  getDashboard,
  getDashboardId,
} from "metabase/dashboard/selectors";
import {
  getOriginalQuestion,
  getQuestion,
} from "metabase/query_builder/selectors";
import { getEmbedOptions, getIsEmbedded } from "metabase/selectors/embed";

import type { State } from "metabase-types/store";

export interface RouterProps {
  location: Location;
}

const HOMEPAGE_PATH = /^\/$/;
const PATHS_WITHOUT_NAVBAR = [
  /\/model\/.*\/query/,
  /\/model\/.*\/metadata/,
  /\/model\/query/,
  /\/model\/metadata/,
];
const EMBEDDED_PATHS_WITH_NAVBAR = [
  HOMEPAGE_PATH,
  /^\/collection\/.*/,
  /^\/archive/,
];
const PATHS_WITH_COLLECTION_BREADCRUMBS = [
  /\/question\//,
  /\/model\//,
  /\/dashboard\//,
];
const PATHS_WITH_QUESTION_LINEAGE = [/\/question/, /\/model/];

export const getRouterPath = (state: State, props: RouterProps) => {
  return props.location.pathname;
};

export const getRouterQueryParameters = (state: State, props: RouterProps) => {
  return props.location.query || {};
};

export const getRouterHash = (state: State, props: RouterProps) => {
  return props.location.hash;
};

export const getIsAdminApp = createSelector([getRouterPath], path => {
  return path.startsWith("/admin/");
});

export const getIsAppBarVisible = createSelector(
  [
    getUser,
    getRouterPath,
    getRouterHash,
    getIsAdminApp,
    getIsEditingDashboard,
    getIsEmbedded,
    getEmbedOptions,
  ],
  (
    currentUser,
    path,
    hash,
    isAdminApp,
    isEditingDashboard,
    isEmbedded,
    embedOptions,
  ) => {
    const isFullscreen = hash.includes("fullscreen");
    if (
      !currentUser ||
      (isEmbedded && !embedOptions.top_nav) ||
      isAdminApp ||
      isEditingDashboard ||
      isFullscreen
    ) {
      return false;
    }
    return !PATHS_WITHOUT_NAVBAR.some(pattern => pattern.test(path));
  },
);

export const getIsNavBarVisible = createSelector(
  [
    getUser,
    getRouterPath,
    getIsEditingDashboard,
    getIsEmbedded,
    getEmbedOptions,
  ],
  (currentUser, path, isEditingDashboard, isEmbedded, embedOptions) => {
    if (!currentUser || isEditingDashboard) {
      return false;
    }
    if (isEmbedded && !embedOptions.side_nav) {
      return false;
    }
    if (isEmbedded && embedOptions.side_nav === "default") {
      return EMBEDDED_PATHS_WITH_NAVBAR.some(pattern => pattern.test(path));
    }
    return !PATHS_WITHOUT_NAVBAR.some(pattern => pattern.test(path));
  },
);

export const getIsSearchVisible = createSelector(
  [getIsEmbedded, getEmbedOptions],
  (isEmbedded, embedOptions) => {
    return !isEmbedded || embedOptions.search;
  },
);

export const getIsNewButtonVisible = createSelector(
  [getIsEmbedded, getEmbedOptions],
  (isEmbedded, embedOptions) => {
    return !isEmbedded || embedOptions.new_button;
  },
);

export const getIsProfileLinkVisible = createSelector(
  [getIsEmbedded],
  isEmbedded => !isEmbedded,
);

export const getErrorPage = (state: State) => {
  return state.app.errorPage;
};

export const getErrorMessage = (state: State) => {
  const errorPage = getErrorPage(state);
  return errorPage?.data?.message || errorPage?.data;
};

export const getCollectionId = createSelector(
  [getQuestion, getDashboard, getDashboardId],
  (question, dashboard, dashboardId) =>
    dashboardId ? dashboard?.collection_id : question?.collectionId(),
);

export const getIsComingFromDataApp = createSelector(
  getRouterQueryParameters,
  params => typeof params.from === "string" && Urls.isDataAppPath(params.from),
);

export const getIsCollectionPathVisible = createSelector(
  [getQuestion, getDashboard, getIsComingFromDataApp, getRouterPath],
  (question, dashboard, isFromDataApp, path) => {
    if (isFromDataApp) {
      return false;
    }
    const isDashboard = dashboard != null;
    return (
      (isDashboard || question?.isSaved()) &&
      PATHS_WITH_COLLECTION_BREADCRUMBS.some(pattern => pattern.test(path))
    );
  },
);

export const getIsQuestionLineageVisible = createSelector(
  [getQuestion, getOriginalQuestion, getIsComingFromDataApp, getRouterPath],
  (question, originalQuestion, isFromDataApp, path) => {
    if (!question || !originalQuestion || isFromDataApp) {
      return false;
    }
    return (
      !question.isSaved() &&
      !originalQuestion.isDataset() &&
      PATHS_WITH_QUESTION_LINEAGE.some(pattern => pattern.test(path))
    );
  },
);

export const getSettings = createSelector(
  (state: State) => state.settings,
  settings => settings.values,
);

export const getTokenStatusStatus = createSelector(
  [getSettings],
  settings => settings["token-status"]?.status,
);
