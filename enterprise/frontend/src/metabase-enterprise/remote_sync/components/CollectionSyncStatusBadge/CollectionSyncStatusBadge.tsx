import { t } from "ttag";

import { Box, Tooltip } from "metabase/ui";

export const CollectionSyncStatusBadge = () => (
  <Tooltip label={t`Unsynced changes`}>
    <Box
      data-testid="remote-sync-status"
      bg="feedback-warning"
      bdrs="50%"
      h="0.5rem"
      w="0.5rem"
      mr="xxs"
      flex="0 0 auto"
    />
  </Tooltip>
);
