import CollectionPermissionsModal from "metabase/admin/permissions/components/CollectionPermissionsModal/CollectionPermissionsModal";
import { useListCollectionsQuery } from "metabase/api";
import { Modal } from "metabase/common/components/Modal";
import type { SnippetCollectionPermissionsModalProps } from "metabase/plugins";

export function SnippetCollectionPermissionsModal({
  collectionId,
  onClose,
}: SnippetCollectionPermissionsModalProps) {
  useListCollectionsQuery({ namespace: "snippets" });

  return (
    <Modal onClose={onClose}>
      <CollectionPermissionsModal
        params={{ slug: collectionId }}
        onClose={onClose}
        namespace="snippets"
      />
    </Modal>
  );
}
