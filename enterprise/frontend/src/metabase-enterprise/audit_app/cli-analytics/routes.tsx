import { Route, withRouteProps } from "metabase/router";

import { CliAnalyticsPage } from "./components/CliAnalyticsPage";

const RoutedCliAnalyticsPage = withRouteProps(CliAnalyticsPage);

/**
 * The `/admin/metabot/usage-auditing/cli` route — nested under the `usage-auditing` namespace so
 * the admin nav opens the "Usage auditing" folder (where the link lives) rather than the Metabot
 * group. Wired into `PLUGIN_AUDIT` and only registered on EE instances with the `audit_app`
 * feature, so navigating there renders nothing on OSS.
 */
export function getCliAnalyticsRoutes() {
  return (
    <Route
      key="cli-analytics"
      path="usage-auditing/cli"
      element={<RoutedCliAnalyticsPage />}
    />
  );
}
