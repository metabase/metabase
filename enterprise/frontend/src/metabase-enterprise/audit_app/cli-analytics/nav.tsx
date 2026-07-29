import { t } from "ttag";

import { AdminNavItem } from "metabase/admin/components/AdminNav";

export function getCliAnalyticsNavItems() {
  return <CliAnalyticsNavItems />;
}

/**
 * The admin "Auditing" nav folder, registered under `audit_app`. AI Auditing (Metabot
 * conversations, usage stats, MCP) now lives in Monitor, so CLI analytics is the only admin-side
 * auditing page left and owns the folder. Lives in EE-only code, so it's absent on OSS. Unlike MCP
 * there's no enabled/disabled flag — the CLI page is always accessible whenever `audit_app` is
 * present.
 */
function CliAnalyticsNavItems() {
  return (
    <AdminNavItem
      icon="audit"
      label={t`Auditing`}
      folderPattern="usage-auditing"
    >
      <CliAnalyticsNavItem />
    </AdminNavItem>
  );
}

export function CliAnalyticsNavItem() {
  return (
    <AdminNavItem
      label={t`CLI analytics`}
      path="/admin/metabot/usage-auditing/cli"
    />
  );
}
