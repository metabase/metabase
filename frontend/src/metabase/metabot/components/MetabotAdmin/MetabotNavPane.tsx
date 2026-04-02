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
            {hasEmbedding && (
              <AdminNavItem
                icon="embed"
                label={t`Embedded Metabot`}
                path={`/admin/metabot/${FIXED_METABOT_IDS.EMBEDDED}`}
              />
            )}
          </>
        )}
        <AdminNavItem
          icon="bolt"
          label={t`MCP apps`}
          path="/admin/metabot/mcp"
        />
      </AdminNavWrapper>
    </Flex>
  );
}
