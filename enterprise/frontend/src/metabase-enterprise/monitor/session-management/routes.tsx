import { sessionManagementUpsellPage } from "metabase/monitor/routes";
import { notFoundRoute } from "metabase/plugins/components/PluginPlaceholder";
import { Route } from "metabase/router";
import { featureGatedRoute } from "metabase-enterprise/settings/feature-gated-route";

const sessionsPage = () =>
  import(
    /* webpackChunkName: "monitor-session-management" */ "./SessionsPage"
  ).then(({ SessionsPage }) => ({
    Component: SessionsPage,
  }));

export function getSessionsRoutes() {
  // One loader for the list and the detail route, so moving between them does
  // not remount the page. Made per tree, because the router resolves a loader
  // once and keeps the page it picked.
  const sessionPage = featureGatedRoute(
    "session-management",
    sessionsPage,
    sessionManagementUpsellPage,
  );

  return (
    <>
      <Route index lazy={sessionPage} />
      <Route path=":sessionId" lazy={sessionPage} />
      <Route
        path="*"
        lazy={featureGatedRoute(
          "session-management",
          notFoundRoute,
          sessionManagementUpsellPage,
        )}
      />
    </>
  );
}
