import { Location } from "history";
import { createSelector } from "reselect";
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
import { State } from "metabase-types/store";

export interface RouterProps {
  location: Location;
}

const HOMEPAGE_PATH = /^\/$/;
const PATHS_WITHOUT_NAVBAR = [/\/model\/.*\/query/, /\/model\/.*\/metadata/];
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

export const getIsCollectionPathVisible = createSelector(
  [getQuestion, getDashboard, getRouterPath],
  (question, dashboard, path) =>
    ((question != null && question.isSaved()) || dashboard != null) &&
    PATHS_WITH_COLLECTION_BREADCRUMBS.some(pattern => pattern.test(path)),
);

export const getIsQuestionLineageVisible = createSelector(
  [getQuestion, getOriginalQuestion, getRouterPath],
  (question, originalQuestion, path) =>
    question != null &&
    !question.isSaved() &&
    originalQuestion != null &&
    !originalQuestion.isDataset() &&
    PATHS_WITH_QUESTION_LINEAGE.some(pattern => pattern.test(path)),
);
