import { t } from "ttag";

import { AdminNavItem } from "metabase/admin/components/AdminNav";

/**
 * The CLI analytics nav item, rendered as a child of the admin "Usage auditing" group
 * (`metabot-analytics/nav`). Lives in EE-only code, so it's absent on OSS. Unlike MCP there's no
 * enabled/disabled flag — the CLI page is always accessible whenever `audit_app` is present.
 */
export function CliAnalyticsNavItem() {
  return (
    <AdminNavItem
      label={t`CLI analytics`}
      path="/admin/metabot/usage-auditing/cli"
    />
  );
}
