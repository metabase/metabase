import { Route, withRouteProps } from "metabase/router";

import { McpAnalyticsPage } from "./components/McpAnalyticsPage";

const RoutedMcpAnalyticsPage = withRouteProps(McpAnalyticsPage);

/**
 * The `/admin/metabot/usage-auditing/mcp` route — nested under the `usage-auditing` namespace so
 * the admin nav opens the "Usage auditing" folder (where the link lives) rather than the MCP
 * group. Wired into `PLUGIN_AUDIT` and only registered on EE instances with the `audit_app`
 * feature, so navigating there renders nothing on OSS.
 */
export function getMcpAnalyticsRoutes() {
  return (
    <Route
      key="mcp-analytics"
      path="usage-auditing/mcp"
      element={<RoutedMcpAnalyticsPage />}
    />
  );
}
