import { t } from "ttag";

import { AdminNavItem } from "metabase/admin/components/AdminNav";

/**
 * The MCP analytics nav item, rendered as a child of the admin "Usage auditing" group
 * (`metabot-analytics/nav`). Lives in EE-only code, so it's absent on OSS. Disabled (greyed) when
 * the MCP server is off — matching the route guard that redirects away from the page.
 */
export function McpAnalyticsNavItem({ mcpEnabled }: { mcpEnabled: boolean }) {
  return (
    <AdminNavItem
      label={t`MCP analytics`}
      path="/admin/metabot/usage-auditing/mcp"
      disabled={!mcpEnabled}
    />
  );
}
