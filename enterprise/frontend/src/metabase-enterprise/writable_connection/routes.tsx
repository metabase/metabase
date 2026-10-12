import { notFoundRoute } from "metabase/plugins/components/PluginPlaceholder";
import { Route } from "metabase/router";
import { featureGatedRoute } from "metabase-enterprise/settings/feature-gated-route";

const writableConnectionInfoPage = () =>
  import(
    /* webpackChunkName: "writable-connection" */ "./pages/WritableConnectionInfoPage"
  ).then(({ WritableConnectionInfoPage }) => ({
    Component: WritableConnectionInfoPage,
  }));

export function getWritableConnectionInfoRoutes() {
  return (
    <Route
      path=":databaseId/write-data"
      lazy={featureGatedRoute(
        "writable_connection",
        writableConnectionInfoPage,
        notFoundRoute,
      )}
    />
  );
}
