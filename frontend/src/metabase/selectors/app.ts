import { Location } from "history";
import { createSelector } from "reselect";
import { getUser } from "metabase/selectors/user";
import { getIsEditing as getIsEditingDashboard } from "metabase/dashboard/selectors";
import { getEmbedOptions, getIsEmbedded } from "metabase/selectors/embed";
import { State } from "metabase-types/store";

interface RouterProps {
  location: Location;
}

const HOMEPAGE_PATH = /^\/$/;
const PATHS_WITHOUT_NAVBAR = [/\/model\/.*\/query/, /\/model\/.*\/metadata/];
const EMBEDDED_PATHS_WITH_NAVBAR = [
  HOMEPAGE_PATH,
  /^\/collection\/.*/,
  /^\/archive/,
];

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

export const getErrorPage = (state: State) => {
  return state.app.errorPage;
};

export const getErrorMessage = (state: State) => {
  const errorPage = getErrorPage(state);
  return errorPage?.data?.message || errorPage?.data;
};
