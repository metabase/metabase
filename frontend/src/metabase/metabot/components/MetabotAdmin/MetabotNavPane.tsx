import { t } from "ttag";

import {
  AdminNavItem,
  AdminNavWrapper,
} from "metabase/admin/components/AdminNav";
import { Flex } from "metabase/ui";

export function MetabotNavPane() {
  return (
    <Flex direction="column" flex="0 0 auto">
      <AdminNavWrapper>
        <AdminNavItem
          icon="gear"
          label={t`AI Settings`}
          path="/admin/metabot/"
        />
      </AdminNavWrapper>
    </Flex>
  );
}
