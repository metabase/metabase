import { t } from "ttag";

import { Box, Tooltip } from "metabase/ui";

export const CollectionSyncStatusBadge = () => (
  <Tooltip label={t`Unsynced changes`}>
    <Box
      bdrs="50%"
      bg="warning"
      h="0.5rem"
      w="0.5rem"
      mr="xs"
      data-testid="remote-sync-status"
    />
  </Tooltip>
);
