import { t } from "ttag";

import {
  AdminNavItem,
  AdminNavWrapper,
} from "metabase/admin/components/AdminNav";
import { useSetting } from "metabase/common/hooks";
import { FIXED_METABOT_IDS } from "metabase/metabot/constants";
import {
  PLUGIN_EMBEDDING_IFRAME_SDK,
  PLUGIN_EMBEDDING_SDK,
} from "metabase/plugins";
import { Flex } from "metabase/ui";

export function MetabotNavPane() {
  const isConfigured = useSetting("llm-metabot-configured?");
  const hasEmbedding =
    PLUGIN_EMBEDDING_SDK.isEnabled() || PLUGIN_EMBEDDING_IFRAME_SDK.isEnabled();

  return (
    <Flex direction="column" flex="0 0 auto">
      <AdminNavWrapper>
        <AdminNavItem
          icon="gear"
          label={t`Connection settings`}
          path="/admin/metabot/setup"
        />
        {isConfigured && (
          <>
            <AdminNavItem
              icon="metabot"
              label={t`Metabot`}
              path={`/admin/metabot/${FIXED_METABOT_IDS.DEFAULT}`}
            />
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
            {hasEmbedding && (
              <AdminNavItem
                icon="embed"
                label={t`Embedded Metabot`}
                path={`/admin/metabot/${FIXED_METABOT_IDS.EMBEDDED}`}
              />
            )}
          </>
        )}
      </AdminNavWrapper>
    </Flex>
  );
}
