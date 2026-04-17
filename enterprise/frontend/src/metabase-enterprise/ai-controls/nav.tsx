import { t } from "ttag";

import { AdminNavItem } from "metabase/admin/components/AdminNav";
import { useSetting } from "metabase/common/hooks";
import { FIXED_METABOT_IDS } from "metabase/metabot/constants";

export function getAiControlsNavItems() {
  return <AiControlsNavItems />;
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
          label={t`AI feature access`}
          path={`/admin/metabot/${FIXED_METABOT_IDS.DEFAULT}/usage-controls/ai-feature-access`}
          disabled={!isConfigured}
        />
        <AdminNavItem
          label={t`AI usage limits`}
          path={`/admin/metabot/${FIXED_METABOT_IDS.DEFAULT}/usage-controls/ai-usage-limits`}
        />
      </AdminNavItem>
      <AdminNavItem
        icon="palette"
        label={t`Customization`}
        path={`/admin/metabot/${FIXED_METABOT_IDS.DEFAULT}/customization`}
        disabled={!isConfigured}
      />
      <AdminNavItem
        icon="document"
        label={t`System prompts`}
        folderPattern="system-prompts"
        disabled={!isConfigured}
      >
        <AdminNavItem
          label={t`Metabot chat`}
          path={`/admin/metabot/${FIXED_METABOT_IDS.DEFAULT}/system-prompts/metabot-chat`}
          disabled={!isConfigured}
        />
        <AdminNavItem
          label={t`Natural language queries`}
          path={`/admin/metabot/${FIXED_METABOT_IDS.DEFAULT}/system-prompts/natural-language-queries`}
          disabled={!isConfigured}
        />
        <AdminNavItem
          label={t`SQL generation`}
          path={`/admin/metabot/${FIXED_METABOT_IDS.DEFAULT}/system-prompts/sql-generation`}
          disabled={!isConfigured}
        />
      </AdminNavItem>
    </>
  );
}
