import { t } from "ttag";

import {
  AdminNavItem,
  AdminNavWrapper,
} from "metabase/admin/components/AdminNav";
import { useSetting } from "metabase/common/hooks";
import { PLUGIN_AI_CONTROLS, PLUGIN_AUDIT } from "metabase/plugins";
import { Flex } from "metabase/ui";

export function MetabotNavPane() {
  const AiControlsNavItems = PLUGIN_AI_CONTROLS.getAiControlsNavItems();
  const AiAnalyticsNavItems = PLUGIN_AUDIT.getMetabotAnalyticsNavItems();
  const areAiFeaturesEnabled = useSetting("ai-features-enabled?") !== false;

  return (
    <Flex direction="column" flex="0 0 auto">
      <AdminNavWrapper>
        <AdminNavItem
          icon="gear"
          label={t`AI Settings`}
          path="/admin/metabot"
        />
        <AdminNavItem
          disabled={!areAiFeaturesEnabled}
          icon="mcp"
          label={t`MCP`}
          path="/admin/metabot/mcp"
        />
        {AiControlsNavItems}
        {AiAnalyticsNavItems}
      </AdminNavWrapper>
    </Flex>
  );
}
