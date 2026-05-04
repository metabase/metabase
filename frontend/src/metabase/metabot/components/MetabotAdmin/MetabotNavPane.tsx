import { t } from "ttag";

import {
  AdminNavItem,
  AdminNavWrapper,
} from "metabase/admin/components/AdminNav";
import { PLUGIN_AI_CONTROLS, PLUGIN_AUDIT } from "metabase/plugins";
import { Flex } from "metabase/ui";

export function MetabotNavPane() {
  const AiControlsNavItems = PLUGIN_AI_CONTROLS.getAiControlsNavItems();
  const AiAnalyticsNavItems = PLUGIN_AUDIT.getMetabotAnalyticsNavItems();

  if (!AiControlsNavItems && !AiAnalyticsNavItems) {
    return null;
  }

  return (
    <Flex direction="column" flex="0 0 auto">
      <AdminNavWrapper>
        <AdminNavItem
          icon="gear"
          label={t`AI Settings`}
          path="/admin/metabot/"
        />
        {AiControlsNavItems}
        {AiAnalyticsNavItems}
      </AdminNavWrapper>
    </Flex>
  );
}
