import { t } from "ttag";

import { AdminNavItem } from "metabase/admin/components/AdminNav";
import { UpsellGem } from "metabase/common/components/upsells/components";
import { useSetting } from "metabase/common/hooks";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { getMcpAnalyticsNavItem } from "../mcp-analytics/nav";

export function getMetabotAnalyticsNavItems() {
  return <MetabotAnalyticsNavItems />;
}

/**
 * The admin "Auditing" nav folder. The plugin only registers this under the `audit_app`
 * feature, so the folder (and its `audit_app`-only MCP child) appears whenever `audit_app` is
 * present. The Metabot "Usage stats"/Conversations children require `ai_controls`; without it an
 * upsell-gem "Usage stats" stub is shown instead.
 */
function MetabotAnalyticsNavItems() {
  const isConfigured = useSetting("llm-metabot-configured?");
  const areAiFeaturesEnabled = useSetting("ai-features-enabled?");

  if (!areAiFeaturesEnabled) {
    return null;
  }

  const hasAiControls = hasPremiumFeature("ai_controls");

  return (
    <AdminNavItem
      icon="audit"
      label={t`Auditing`}
      folderPattern="usage-auditing"
      disabled={!isConfigured}
    >
      {hasAiControls ? (
        <>
          <AdminNavItem
            label={t`Usage stats`}
            path="/admin/metabot/usage-auditing"
            disabled={!isConfigured}
          />
          <AdminNavItem
            label={t`Conversations`}
            path="/admin/metabot/usage-auditing/conversations"
            disabled={!isConfigured}
          />
        </>
      ) : (
        <AdminNavItem
          label={t`Usage stats`}
          path="/admin/metabot/usage-auditing"
          rightSection={<UpsellGem.New size={14} />}
        />
      )}
      {getMcpAnalyticsNavItem()}
    </AdminNavItem>
  );
}
