import { Route, registerPagePrefetch } from "metabase/router";

const APPLICATION_PERMISSIONS_PATH = "/admin/permissions/application";

const applicationPermissionsPage = () =>
  import(
    /* webpackChunkName: "application-permissions" */ "./pages/ApplicationPermissionsPage"
  ).then((module) => ({
    Component: module.default,
  }));

/**
 * Called from the licensed branch of `initializePlugin`, so only a page this
 * instance mounts is registered. The background pass reads the registrations too,
 * and fetching a page nobody can reach would spend a download on nothing.
 */
export function registerApplicationPermissionsPagePrefetch(): void {
  registerPagePrefetch(
    APPLICATION_PERMISSIONS_PATH,
    applicationPermissionsPage,
  );
}

const getRoutes = () => (
  <Route path="application" lazy={applicationPermissionsPage} />
);

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default getRoutes;
