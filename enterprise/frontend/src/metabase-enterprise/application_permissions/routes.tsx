import { Route, registerPagePrefetch } from "metabase/router";

const APPLICATION_PERMISSIONS_PATH = "/admin/permissions/application";

const applicationPermissionsPage = () =>
  import(
    /* webpackChunkName: "application-permissions" */ "./pages/ApplicationPermissionsPage"
  ).then((module) => ({
    Component: module.default,
  }));

registerPagePrefetch(APPLICATION_PERMISSIONS_PATH, applicationPermissionsPage);

const getRoutes = () => (
  <Route path="application" lazy={applicationPermissionsPage} />
);

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default getRoutes;
