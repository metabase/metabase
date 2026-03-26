import { t } from "ttag";

import {
  AdminNavItem,
  AdminNavWrapper,
} from "metabase/admin/components/AdminNav";
import { useSetting } from "metabase/common/hooks";
import { FIXED_METABOT_IDS } from "metabase/metabot/constants";
import { Flex } from "metabase/ui";

export function MetabotNavPane() {
  const isConfigured = useSetting("llm-metabot-configured?");

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
              path={`/admin/metabot/${FIXED_METABOT_IDS.DEFAULT}/usage-controls`}
            />
            <AdminNavItem
              icon="palette"
              label={t`Customize`}
              path={`/admin/metabot/${FIXED_METABOT_IDS.DEFAULT}/customization`}
            />
            <AdminNavItem
              icon="document"
              label={t`System prompts`}
              path={`/admin/metabot/${FIXED_METABOT_IDS.DEFAULT}/system-prompts`}
            />
          </>
        )}
      </AdminNavWrapper>
    </Flex>
  );
}
