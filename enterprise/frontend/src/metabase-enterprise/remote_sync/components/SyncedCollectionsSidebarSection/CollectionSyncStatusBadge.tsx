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
      <Box bdrs="50%" bg="warning" h={12} w={12} mr="xs" />
    </Tooltip>
  );
};
