import { t } from "ttag";

import { Box, EntityNameCell, Tooltip } from "metabase/ui";
import { getPermissionErrorMessage } from "metabase/viz-core";

export function UnreadableNameCell() {
  return (
    <Tooltip label={getPermissionErrorMessage()}>
      <Box miw={0}>
        <EntityNameCell
          data-testid="content-name"
          icon="lock"
          iconColor="text-secondary"
          nameColor="text-secondary"
          name={t`Restricted question`}
        />
      </Box>
    </Tooltip>
  );
}
