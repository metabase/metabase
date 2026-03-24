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
          icon="gear"
          label={t`Settings`}
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
      </AdminNavWrapper>
    </Flex>
  );
}
