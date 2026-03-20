import { t } from "ttag";

import {
  AdminNavItem,
  AdminNavWrapper,
} from "metabase/admin/components/AdminNav";
import { FIXED_METABOT_IDS } from "metabase/metabot/constants";
import { Flex } from "metabase/ui";

export function MetabotNavPane() {
  return (
    <Flex direction="column" flex="0 0 auto">
      <AdminNavWrapper>
        <AdminNavItem
          key="sql"
          icon="sql"
          label={t`SQL Generation`}
          path="/admin/metabot/sql-generation"
        />
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
      </AdminNavWrapper>
    </Flex>
  );
}
