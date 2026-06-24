import { t } from "ttag";

import { AdminNavItem } from "metabase/admin/components/AdminNav";

/**
 * The MCP analytics nav item, rendered as a child of the admin "Usage auditing" group
 * (`metabot-analytics/nav`). Lives in EE-only code, so it's absent on OSS.
 */
export function getMcpAnalyticsNavItem() {
  return (
    <AdminNavItem
      label={t`MCP analytics`}
      path="/admin/metabot/usage-auditing/mcp"
    />
  );
}
