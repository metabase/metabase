import CollectionPermissionsModalBase from "metabase/admin/permissions/components/CollectionPermissionsModal/CollectionPermissionsModal";
import { skipToken, useListCollectionsQuery } from "metabase/api";
import type { CollectionPermissionsModalProps } from "metabase/plugins";
import { Modal } from "metabase/ui";

export function CollectionPermissionsModal({
  collectionId,
  namespace,
  onClose,
}: CollectionPermissionsModalProps) {
  useListCollectionsQuery(
    namespace === "snippets" ? { namespace: "snippets" } : skipToken,
  );

  return (
    <Modal
      opened
      size="640px"
      padding={0}
      withCloseButton={false}
      onClose={onClose}
    >
      <CollectionPermissionsModalBase
        params={{ slug: String(collectionId) }}
        namespace={namespace ?? null}
        onClose={onClose}
      />
    </Modal>
  );
}
