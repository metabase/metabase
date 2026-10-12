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

const sessionPage = featureGatedRoute(
  "session-management",
  sessionsPage,
  sessionManagementUpsellPage,
);

export function getSessionsRoutes() {
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
