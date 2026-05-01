import { t } from "ttag";

import { AdminNavItem } from "metabase/admin/components/AdminNav";
import { useSetting } from "metabase/common/hooks";

export function getMetabotAnalyticsNavItems() {
  return <MetabotAnalyticsNavItems />;
}

function MetabotAnalyticsNavItems() {
  const isConfigured = useSetting("llm-metabot-configured?");
  const areAiFeaturesEnabled = useSetting("ai-features-enabled?");

  if (!areAiFeaturesEnabled) {
    return null;
  }

  return (
    <AdminNavItem
      icon="audit"
      label={t`Usage auditing`}
      folderPattern="usage-auditing"
      disabled={!isConfigured}
    >
      <AdminNavItem
        label={t`Stats`}
        path="/admin/metabot/usage-auditing"
        disabled={!isConfigured}
      />
      <AdminNavItem
        label={t`Conversations`}
        path="/admin/metabot/usage-auditing/conversations"
        disabled={!isConfigured}
      />
    </AdminNavItem>
  );
}
