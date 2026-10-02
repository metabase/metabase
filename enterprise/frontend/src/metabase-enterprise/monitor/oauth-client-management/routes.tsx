import { Route } from "metabase/router";

const oauthClientsPage = () =>
  import(
    /* webpackChunkName: "monitor-oauth-client-management" */ "./OAuthClientsPage"
  ).then(({ OAuthClientsPage }) => ({
    Component: OAuthClientsPage,
  }));

export function getOAuthClientManagementRoutes() {
  return <Route index lazy={oauthClientsPage} />;
}
