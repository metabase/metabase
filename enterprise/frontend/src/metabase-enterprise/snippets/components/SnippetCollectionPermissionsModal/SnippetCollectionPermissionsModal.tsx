import CollectionPermissionsModal from "metabase/admin/permissions/components/CollectionPermissionsModal/CollectionPermissionsModal";
import { useListCollectionsQuery } from "metabase/api";
import type { SnippetCollectionPermissionsModalProps } from "metabase/plugins";

export function SnippetCollectionPermissionsModal({
  opened,
  collectionId,
  onClose,
}: SnippetCollectionPermissionsModalProps) {
  useListCollectionsQuery({ namespace: "snippets" });

  return (
    <CollectionPermissionsModal
      opened={opened}
      params={{ slug: String(collectionId) }}
      onClose={onClose}
      namespace="snippets"
    />
  );
}
