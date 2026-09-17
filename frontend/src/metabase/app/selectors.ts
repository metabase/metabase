import { createSelector } from "@reduxjs/toolkit";

import { getUser } from "metabase/current-user";
import {
  getDashboard,
  getDashboardId,
  getIsEditing as getIsEditingDashboard,
} from "metabase/dashboard/shell-selectors";
import { getCurrentDocument } from "metabase/documents/selectors";
import { getEmbedOptions } from "metabase/embedding/interactive-embedding";
import { getCurrentExploration } from "metabase/explorations/selectors";
import { getQuestion } from "metabase/query_builder";
import type { State } from "metabase/redux/store";
import { type RouterProps, getPageCollection } from "metabase/selectors/app";
import * as Urls from "metabase/urls";
import { selectIsWithinIframe } from "metabase/utils/iframe";

// `props` is optional because most callers read these through `useSelector`,
// which passes only the state. The router's own location is the fallback.
export const getRouterPath = (state: State, props?: RouterProps) => {
  return props?.location?.pathname ?? window.location.pathname;
};

export const getRouterHash = (state: State, props?: RouterProps) => {
  return props?.location?.hash ?? window.location.hash;
};

export const getIsAdminApp = createSelector([getRouterPath], (path) => {
  return path.startsWith("/admin/");
});

export const getIsDataStudioApp = createSelector([getRouterPath], (path) => {
  return path.startsWith("/data-studio");
});

export const getIsMonitorApp = createSelector([getRouterPath], (path) => {
  return path.startsWith("/monitor");
});

export const getIsDataApp = createSelector([getRouterPath], (path) => {
  return path.startsWith(`${Urls.DATA_APP_ROOT_URL}/`);
});

const PATHS_WITHOUT_NAVBAR = [
  /^\/setup/,
  /^\/auth/,
  /^\/data-studio/,
  /^\/monitor/,
  // Data apps run full-page with their own custom chrome (a hover-down panel),
  // so neither the left navbar nor the top app bar should be shown.
  new RegExp(`^${Urls.DATA_APP_ROOT_URL}/`),
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

export const getIsCollectionPathVisible = createSelector(
  [
    getQuestion,
    getDashboard,
    getCurrentDocument,
    getPageCollection,
    getRouterPath,
    selectIsWithinIframe,
    getEmbedOptions,
    getCurrentExploration,
  ],
  (
    question,
    dashboard,
    document,
    pageCollection,
    path,
    isEmbedded,
    embedOptions,
    exploration,
  ) => {
    if (isEmbedded && !embedOptions.breadcrumbs) {
      return false;
    }

    // A page that names its own collection gets breadcrumbs wherever it lives.
    if (pageCollection) {
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
        document !== null ||
        exploration != null) &&
      PATHS_WITH_COLLECTION_BREADCRUMBS.some((pattern) => pattern.test(path))
    );
  },
);

export const getIsNavBarEnabled = createSelector(
  [
    getUser,
    getRouterPath,
    getIsEditingDashboard,
    selectIsWithinIframe,
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

const getIsEmbeddedPageHeaderVisible = createSelector(
  [getEmbedOptions, getIsCollectionPathVisible, getIsNavBarEnabled],
  (embedOptions, isCollectionPathVisible, isNavBarEnabled) => {
    const anyEmbeddedHeaderElementVisible =
      isNavBarEnabled || embedOptions.search || isCollectionPathVisible;
    return embedOptions.top_nav && anyEmbeddedHeaderElementVisible;
  },
);

export const getIsPageHeaderVisible = createSelector(
  [
    getUser,
    getRouterPath,
    getRouterHash,
    getIsAdminApp,
    getIsDataStudioApp,
    getIsMonitorApp,
    getIsEditingDashboard,
    selectIsWithinIframe,
    getIsEmbeddedPageHeaderVisible,
  ],
  (
    currentUser,
    path,
    hash,
    isAdminApp,
    isDataStudioApp,
    isMonitorApp,
    isEditingDashboard,
    isEmbedded,
    isEmbeddedPageHeaderVisible,
  ) => {
    const isFullscreen = hash.includes("fullscreen");

    if (
      !currentUser ||
      (isEmbedded && !isEmbeddedPageHeaderVisible) ||
      isAdminApp ||
      isDataStudioApp ||
      isMonitorApp ||
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
    getPageCollection,
    getRouterPath,
    getCurrentExploration,
  ],
  (
    question,
    dashboard,
    dashboardId,
    document,
    pageCollection,
    path,
    exploration,
  ) => {
    if (pageCollection) {
      return pageCollection.collectionId;
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

    if (exploration) {
      return exploration.collection_id;
    }

    // On a collection page the URL itself identifies the current collection.
    return Urls.extractCollectionIdFromPath(path);
  },
);
