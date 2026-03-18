import { t } from "ttag";

import {
  AdminNavItem,
  AdminNavWrapper,
} from "metabase/admin/components/AdminNav";
import { useSetting } from "metabase/common/hooks";
import { Flex } from "metabase/ui";
import { FIXED_METABOT_IDS } from "metabase-enterprise/metabot/constants";

export function MetabotNavPane() {
  const isHosted = useSetting("is-hosted?");
  const isConfigured = useSetting("ee-ai-metabot-configured?");

  return (
    <Flex direction="column" flex="0 0 auto">
      <AdminNavWrapper>
        {!isHosted && (
          <AdminNavItem
            icon="gear"
            label={t`Setup Metabot`}
            path="/admin/metabot/setup"
          />
        )}
        {isConfigured && (
          <>
            <AdminNavItem
              icon="metabot"
              label={t`Metabot`}
              path={`/admin/metabot/${FIXED_METABOT_IDS.DEFAULT}`}
            />
            <AdminNavItem
              icon="embed"
              label={t`Embedded Metabot`}
              path={`/admin/metabot/${FIXED_METABOT_IDS.EMBEDDED}`}
            />
          </>
        )}
      </AdminNavWrapper>
    </Flex>
  );
}
