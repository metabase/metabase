import CollectionPermissionsModal from "metabase/admin/permissions/components/CollectionPermissionsModal/CollectionPermissionsModal";
import { useListCollectionsQuery } from "metabase/api";
import type { SnippetCollectionPermissionsModalProps } from "metabase/plugins";
import { Modal } from "metabase/ui";

export function SnippetCollectionPermissionsModal({
  collectionId,
  onClose,
}: SnippetCollectionPermissionsModalProps) {
  useListCollectionsQuery({ namespace: "snippets" });

  return (
    <Modal
      opened
      size="640px"
      padding={0}
      withCloseButton={false}
      onClose={onClose}
    >
      <CollectionPermissionsModal
        params={{ slug: String(collectionId) }}
        onClose={onClose}
        namespace="snippets"
      />
    </Modal>
  );
}
