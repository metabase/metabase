import { t } from "ttag";

import { AdminNavItem } from "metabase/admin/components/AdminNav";
import { UpsellGem } from "metabase/common/components/upsells/components";
import { useSetting } from "metabase/common/hooks";

export function getAiControlsNavItems() {
  return <AiControlsNavItems />;
}

export function getAiControlsUpsellNavItems() {
  return <AiControlsUpsellNavItems />;
}

function AiControlsNavItems() {
  const isConfigured = useSetting("llm-metabot-configured?");
  const areAiFeaturesEnabled = useSetting("ai-features-enabled?");

  if (!areAiFeaturesEnabled) {
    return null;
  }

  return (
    <>
      <AdminNavItem
        icon="lock"
        label={t`Usage controls`}
        folderPattern="usage-controls"
        disabled={!isConfigured}
      >
        <AdminNavItem
          label={t`Access`}
          path="/admin/metabot/usage-controls/ai-feature-access"
          disabled={!isConfigured}
        />
        <AdminNavItem
          label={t`Limits`}
          path="/admin/metabot/usage-controls/ai-usage-limits"
        />
      </AdminNavItem>
      <AdminNavItem
        icon="palette"
        label={t`Customization`}
        path="/admin/metabot/customization"
        disabled={!isConfigured}
      />
      <AdminNavItem
        icon="document"
        label={t`System prompts`}
        folderPattern="system-prompts"
        disabled={!isConfigured}
      >
        <AdminNavItem
          label={t`AI chat`}
          path="/admin/metabot/system-prompts/metabot-chat"
          disabled={!isConfigured}
        />
        <AdminNavItem
          label={t`Natural language queries`}
          path="/admin/metabot/system-prompts/natural-language-queries"
          disabled={!isConfigured}
        />
        <AdminNavItem
          label={t`SQL generation`}
          path="/admin/metabot/system-prompts/sql-generation"
          disabled={!isConfigured}
        />
      </AdminNavItem>
    </>
  );
}

function AiControlsUpsellNavItems() {
  return (
    <>
      <AdminNavItem
        icon="lock"
        label={t`Usage controls`}
        path="/admin/metabot/usage-controls/ai-feature-access"
        rightSection={<UpsellGem.New size={14} />}
      />
      <AdminNavItem
        icon="palette"
        label={t`Customization`}
        path="/admin/metabot/customization"
        rightSection={<UpsellGem.New size={14} />}
      />
      <AdminNavItem
        icon="document"
        label={t`System prompts`}
        path="/admin/metabot/system-prompts/metabot-chat"
        rightSection={<UpsellGem.New size={14} />}
      />
    </>
  );
}
