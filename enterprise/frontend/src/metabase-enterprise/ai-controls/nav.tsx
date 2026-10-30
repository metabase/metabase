import { t } from "ttag";

import { AdminNavItem } from "metabase/admin/components/AdminNav";
import { UpsellGem } from "metabase/common/components/upsells/components";
import { useSetting } from "metabase/settings";

export function getAiControlsNavItems() {
  return <AiControlsNavItems />;
}

export function getAiControlsUpsellNavItems() {
  return <AiControlsUpsellNavItems />;
}

export function getAiControlsPermissionsNavItems() {
  return <AiControlsPermissionsNavItems />;
}

export function getAiControlsPermissionsUpsellNavItems() {
  return <AiControlsPermissionsUpsellNavItems />;
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
        icon="gauge"
        label={t`Usage limits`}
        path="/admin/metabot/ai-usage-limits"
        disabled={!isConfigured}
      />
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
        icon="gauge"
        label={t`Usage limits`}
        path="/admin/metabot/ai-usage-limits"
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

function AiControlsPermissionsNavItems() {
  const isConfigured = useSetting("llm-metabot-configured?");
  const isMcpEnabled = useSetting("mcp-enabled?");
  const areAiFeaturesEnabled = useSetting("ai-features-enabled?");

  if (!areAiFeaturesEnabled) {
    return null;
  }

  return (
    <>
      {isConfigured && (
        <AdminNavItem
          icon="ai"
          label={t`AI feature access`}
          path="/admin/permissions/ai-feature-access"
        />
      )}
      {isMcpEnabled && (
        <AdminNavItem
          icon="mcp"
          label={t`MCP tool access`}
          path="/admin/permissions/mcp-tool-access"
        />
      )}
    </>
  );
}

function AiControlsPermissionsUpsellNavItems() {
  return (
    <AdminNavItem
      icon="ai"
      label={t`AI feature access`}
      path="/admin/permissions/ai-feature-access"
      rightSection={<UpsellGem.New size={14} />}
    />
  );
}
