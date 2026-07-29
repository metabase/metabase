import { t } from "ttag";

import { AdminNavItem } from "metabase/admin/components/AdminNav";
import { UpsellGem } from "metabase/common/components/upsells/components";
import { useSetting } from "metabase/common/hooks";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { CliAnalyticsNavItem } from "../cli-analytics/nav";
import { McpAnalyticsNavItem } from "../mcp-analytics/nav";

export function getMetabotAnalyticsNavItems() {
  return <MetabotAnalyticsNavItems />;
}

/**
 * The admin "Auditing" nav folder, registered under `audit_app`, so the folder and its
 * `audit_app`-gated MCP child appear whenever `audit_app` is present. The Metabot "Usage
 * stats"/Conversations children additionally need `ai-features-enabled?` and `ai_controls`;
 * without `ai_controls` an upsell-gem "Usage stats" stub is shown instead. `ai-features-enabled?`
 * gates only the Metabot children — never the folder, the upsell, or the MCP child.
 */
function MetabotAnalyticsNavItems() {
  const isConfigured = useSetting("llm-metabot-configured?");
  const areAiFeaturesEnabled = useSetting("ai-features-enabled?");
  const mcpEnabled = useSetting("mcp-enabled?");
  const hasAiControls = hasPremiumFeature("ai_controls");

  const showMetabotStats = areAiFeaturesEnabled && hasAiControls;

  return (
    <AdminNavItem
      icon="audit"
      label={t`Auditing`}
      folderPattern="usage-auditing"
      disabled={!isConfigured}
    >
      {showMetabotStats ? (
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
        !hasAiControls && (
          <AdminNavItem
            label={t`Usage stats`}
            path="/admin/metabot/usage-auditing"
            rightSection={<UpsellGem.New size={14} />}
          />
        )
      )}
      <McpAnalyticsNavItem mcpEnabled={mcpEnabled} />
      <CliAnalyticsNavItem />
    </AdminNavItem>
  );
}
