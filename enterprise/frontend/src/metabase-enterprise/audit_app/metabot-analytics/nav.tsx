import { t } from "ttag";

import { AdminNavItem } from "metabase/admin/components/AdminNav";

export function getMetabotAnalyticsNavItems() {
  return (
    <AdminNavItem
      icon="insight"
      label={t`Usage stats`}
      folderPattern="usage-stats"
    >
      <AdminNavItem
        label={t`Conversation stats`}
        path="/admin/metabot/usage-stats"
      />
      <AdminNavItem
        label={t`Conversations`}
        path="/admin/metabot/usage-stats/conversations"
      />
    </AdminNavItem>
  );
}
