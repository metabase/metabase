import { Fragment } from "react";
import { t } from "ttag";

import {
  AdminNavItem,
  AdminNavWrapper,
} from "metabase/admin/components/AdminNav";
import { PLUGIN_AI_CONTROLS } from "metabase/plugins";
import { Flex } from "metabase/ui";

export function MetabotNavPane() {
  const AiControlsNavItems = PLUGIN_AI_CONTROLS.AiControlsNavItems;

  if (!AiControlsNavItems) {
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
        <Fragment key="ai-controls">
          <AiControlsNavItems />
        </Fragment>
      </AdminNavWrapper>
    </Flex>
  );
}
