import { t } from "ttag";

import {
  AdminNavItem,
  AdminNavWrapper,
} from "metabase/admin/components/AdminNav";
import { Flex } from "metabase/ui";
import { FIXED_METABOT_IDS } from "metabase-enterprise/metabot/constants";

export function MetabotNavPane() {
  return (
    <Flex direction="column" flex="0 0 auto">
      <AdminNavWrapper>
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
        <AdminNavItem
          icon="slack"
          label={t`Slackbot`}
          path={`/admin/metabot/slackbot`}
        />
      </AdminNavWrapper>
    </Flex>
  );
}
