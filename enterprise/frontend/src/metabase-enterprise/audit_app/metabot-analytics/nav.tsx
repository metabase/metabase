import { t } from "ttag";

import { AdminNavItem } from "metabase/admin/components/AdminNav";

export function getMetabotAnalyticsNavItems() {
  return (
    <AdminNavItem
      icon="audit"
      label={t`Usage auditing`}
      folderPattern="usage-auditing"
    >
      <AdminNavItem label={t`Stats`} path="/admin/metabot/usage-auditing" />
      <AdminNavItem
        label={t`Conversations`}
        path="/admin/metabot/usage-auditing/conversations"
      />
    </AdminNavItem>
  );
}
