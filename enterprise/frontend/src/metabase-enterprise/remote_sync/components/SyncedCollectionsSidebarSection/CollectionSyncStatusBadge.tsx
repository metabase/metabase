import { t } from "ttag";

import { Box, Tooltip } from "metabase/ui";
import type { Collection } from "metabase-types/api";

interface CollectionSyncStatusBadgeProps {
  collection: Pick<Collection, "id">;
  changedCollections?: Record<number, boolean>;
}

export const CollectionSyncStatusBadge = ({
  collection,
  changedCollections,
}: CollectionSyncStatusBadgeProps) => {
  const isDirty =
    changedCollections != null &&
    typeof collection?.id === "number" &&
    changedCollections[collection.id];

  if (!isDirty) {
    return null;
  }

  return (
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
};
