import { t } from "ttag";

import { AdminNavItem } from "metabase/admin/components/AdminNav";
import { FIXED_METABOT_IDS } from "metabase/metabot/constants";

export function getAiControlsNavItems() {
  return (
    <>
      <AdminNavItem
        icon="lock"
        label={t`Usage controls`}
        folderPattern="usage-controls"
      >
        <AdminNavItem
          label={t`AI feature access`}
          path={`/admin/metabot/${FIXED_METABOT_IDS.DEFAULT}/usage-controls/ai-feature-access`}
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
      />
      <AdminNavItem
        icon="document"
        label={t`System prompts`}
        folderPattern="system-prompts"
      >
        <AdminNavItem
          label={t`Metabot chat`}
          path={`/admin/metabot/${FIXED_METABOT_IDS.DEFAULT}/system-prompts/metabot-chat`}
        />
        <AdminNavItem
          label={t`Natural language queries`}
          path={`/admin/metabot/${FIXED_METABOT_IDS.DEFAULT}/system-prompts/natural-language-queries`}
        />
        <AdminNavItem
          label={t`SQL generation`}
          path={`/admin/metabot/${FIXED_METABOT_IDS.DEFAULT}/system-prompts/sql-generation`}
        />
      </AdminNavItem>
    </>
  );
}
