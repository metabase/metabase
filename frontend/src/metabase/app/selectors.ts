import { createSelector } from "@reduxjs/toolkit";

import {
  getDashboard,
  getDashboardId,
  getIsEditing as getIsEditingDashboard,
} from "metabase/dashboard/selectors";
import { getCurrentDocument } from "metabase/documents/selectors";
import {
  getIsSavedQuestionChanged,
  getQuestion,
} from "metabase/query_builder/selectors";
import type { State } from "metabase/redux/store";
import { type RouterProps, getDetailViewState } from "metabase/selectors/app";
import {
  getEmbedOptions,
  getIsEmbeddingIframe,
} from "metabase/selectors/embed";
import { getUser } from "metabase/selectors/user";
import * as Urls from "metabase/urls";

export const getRouterPath = (state: State, props: RouterProps) => {
  return props?.location?.pathname ?? window.location.pathname;
};

export const getRouterHash = (state: State, props: RouterProps) => {
  return props?.location?.hash ?? window.location.hash;
};

export const getIsAdminApp = createSelector([getRouterPath], (path) => {
  return path.startsWith("/admin/");
});

export const getIsDataStudioApp = createSelector([getRouterPath], (path) => {
  return path.startsWith("/data-studio");
});

export const getIsMetricsViewer = createSelector([getRouterPath], (path) => {
  return path.startsWith("/explore");
});

export const getIsLogoVisible = createSelector(
  [getIsEmbeddingIframe, getEmbedOptions],
  (isEmbeddingIframe, embedOptions) => {
    return !isEmbeddingIframe || embedOptions.logo;
  },
);

export const getIsSearchVisible = createSelector(
  [getIsEmbeddingIframe, getEmbedOptions],
  (isEmbeddingIframe, embedOptions) => {
    return !isEmbeddingIframe || embedOptions.search;
  },
);

export const getIsNewButtonVisible = createSelector(
  [getIsEmbeddingIframe, getEmbedOptions],
  (isEmbeddingIframe, embedOptions) => {
    return !isEmbeddingIframe || embedOptions.new_button;
  },
);

export const getIsAppSwitcherVisible = createSelector(
  [getIsEmbeddingIframe],
  (isEmbeddingIframe) => !isEmbeddingIframe,
);

const PATHS_WITHOUT_NAVBAR = [
  /^\/setup/,
  /^\/auth/,
  /^\/data-studio/,
  /\/model\/.*\/query/,
  /\/model\/.*\/columns/,
  /\/model\/.*\/metadata/,
  /\/model\/query/,
  /\/model\/columns/,
  /\/model\/metadata/,
  /\/transform\/new\/.*\/query/,
];

const PATHS_WITH_COLLECTION_BREADCRUMBS = [
  /\/question\//,
  /\/model\//,
  /\/metric\//,
  /\/dashboard\//,
  /\/document\//,
];

// Paths where collection identity comes from the URL itself, so breadcrumbs
// can render without needing a question/dashboard/document in redux state.
const STANDALONE_COLLECTION_BREADCRUMB_PATHS = [/\/collection\//];
const PATHS_WITH_QUESTION_LINEAGE = [/\/question/, /\/model/];

export const getIsCollectionPathVisible = createSelector(
  [
    getQuestion,
    getDashboard,
    getCurrentDocument,
    getRouterPath,
    getIsEmbeddingIframe,
    getEmbedOptions,
  ],
  (question, dashboard, document, path, isEmbedded, embedOptions) => {
    if (isEmbedded && !embedOptions.breadcrumbs) {
      return false;
    }

    const isModelDetail = /\/model\/.*\/detail\/.*/.test(path);
    if (isModelDetail) {
      return true;
    }

    if (
      STANDALONE_COLLECTION_BREADCRUMB_PATHS.some((pattern) =>
        pattern.test(path),
      )
    ) {
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
  [
    getUser,
    getRouterPath,
    getIsEditingDashboard,
    getIsEmbeddingIframe,
    getEmbedOptions,
  ],
  (currentUser, path, isEditingDashboard, isEmbedded, embedOptions) => {
    if (!currentUser || isEditingDashboard) {
      return false;
    }
    if (isEmbedded && !embedOptions.side_nav) {
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
    getIsDataStudioApp,
    getIsEditingDashboard,
    getIsEmbeddingIframe,
    getIsEmbeddedAppBarVisible,
  ],
  (
    currentUser,
    path,
    hash,
    isAdminApp,
    isDataStudioApp,
    isEditingDashboard,
    isEmbedded,
    isEmbeddedAppBarVisible,
  ) => {
    const isFullscreen = hash.includes("fullscreen");

    if (
      !currentUser ||
      (isEmbedded && !isEmbeddedAppBarVisible) ||
      isAdminApp ||
      isDataStudioApp ||
      isEditingDashboard ||
      isFullscreen
    ) {
      return false;
    }
    return !PATHS_WITHOUT_NAVBAR.some((pattern) => pattern.test(path));
  },
);

export const getCollectionId = createSelector(
  [
    getQuestion,
    getDashboard,
    getDashboardId,
    getCurrentDocument,
    getDetailViewState,
    getRouterPath,
  ],
  (question, dashboard, dashboardId, document, detailView, path) => {
    if (detailView) {
      return detailView.collectionId;
    }

    if (document) {
      return document.collection_id;
    }

    if (dashboardId) {
      return dashboard?.collection_id;
    }

    const questionCollectionId = question?.collectionId();
    if (questionCollectionId != null) {
      return questionCollectionId;
    }

    // On a collection page the URL itself identifies the current collection.
    return Urls.extractCollectionIdFromPath(path);
  },
);
