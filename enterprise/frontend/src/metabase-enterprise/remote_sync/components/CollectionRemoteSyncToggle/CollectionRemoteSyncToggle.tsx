import { useCallback } from "react";
import { t } from "ttag";

import type { CollectionRemoteSyncToggleProps } from "metabase/plugins";
import { Switch } from "metabase/ui";

/**
 * Toggle component for enabling/disabling remote sync on shared tenant collections.
 * Only visible for collections at root level ("/") with namespace "shared-tenant-collection".
 */
export const CollectionRemoteSyncToggle = ({
  collection,
  onUpdateCollection,
}: CollectionRemoteSyncToggleProps) => {
  const isSharedTenantCollection =
    collection.namespace === "shared-tenant-collection";
  const isRootLevel = collection.location === "/";

  const handleToggle = useCallback(
    (checked: boolean) => {
      onUpdateCollection(collection, {
        is_remote_synced: checked,
      });
    },
    [collection, onUpdateCollection],
  );

  // Only show for shared tenant collections at root level
  if (!isSharedTenantCollection || !isRootLevel) {
    return null;
  }

  const canWrite = collection.can_write;

  return (
    <Switch
      label={t`Remote sync`}
      labelPosition="left"
      variant="stretch"
      size="sm"
      checked={collection.is_remote_synced ?? false}
      onChange={(e) => handleToggle(e.currentTarget.checked)}
      disabled={!canWrite}
    />
  );
};
