import CollectionPermissionsModalBase from "metabase/admin/permissions/components/CollectionPermissionsModal/CollectionPermissionsModal";
import { skipToken, useListCollectionsQuery } from "metabase/api";
import type { CollectionPermissionsModalProps } from "metabase/plugins";

export function CollectionPermissionsModal({
  opened,
  collectionId,
  namespace,
  onClose,
}: CollectionPermissionsModalProps) {
  useListCollectionsQuery(
    namespace === "snippets" || namespace === "data-actions"
      ? { namespace }
      : skipToken,
  );

  return (
    <CollectionPermissionsModalBase
      opened={opened}
      params={{ slug: String(collectionId) }}
      namespace={namespace ?? null}
      onClose={onClose}
    />
  );
}
