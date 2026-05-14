import CollectionPermissionsModalBase from "metabase/admin/permissions/components/CollectionPermissionsModal/CollectionPermissionsModal";
import { skipToken, useListCollectionsQuery } from "metabase/api";
import { Modal } from "metabase/common/components/Modal";
import type { CollectionPermissionsModalProps } from "metabase/plugins";

export function CollectionPermissionsModal({
  collectionId,
  namespace,
  onClose,
}: CollectionPermissionsModalProps) {
  useListCollectionsQuery(
    namespace === "snippets" ? { namespace: "snippets" } : skipToken,
  );

  return (
    <Modal onClose={onClose}>
      <CollectionPermissionsModalBase
        params={{ slug: String(collectionId) }}
        namespace={namespace}
        onClose={onClose}
      />
    </Modal>
  );
}
