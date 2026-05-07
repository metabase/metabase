import { t } from "ttag";

import { AdminNavItem } from "metabase/admin/components/AdminNav";
import { UpsellGem } from "metabase/common/components/upsells/components";
import { useSetting } from "metabase/common/hooks";

export function getMetabotAnalyticsNavItems() {
  return <MetabotAnalyticsNavItems />;
}

export function getMetabotAnalyticsUpsellNavItems() {
  return <MetabotAnalyticsUpsellNavItems />;
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

function MetabotAnalyticsUpsellNavItems() {
  return (
    <AdminNavItem
      icon="audit"
      label={t`Usage auditing`}
      path="/admin/metabot/usage-auditing"
      rightSection={<UpsellGem.New size={14} />}
    />
  );
}
